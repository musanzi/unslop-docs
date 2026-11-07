import { DocumentPhase, ProcessingFailure, ProcessingStage } from '../documents/document-processing';
import { randomUUID } from 'node:crypto';
import { DocumentDetection } from '../documents/detection-rate';
import { ProviderFailureCategory } from '../documents/provider-failure';
import { RevisionNotices } from '../documents/revision-notices';
import { DocumentPreview } from '../documents/document-preview';

export interface ProviderRequestCheckpoint {
  inputHash: string;
  attempts: number;
  state: 'running' | 'retry' | 'succeeded' | 'failed';
  outcome?: unknown;
  failure?: { category: ProviderFailureCategory; status?: number };
}

const reserved = `(document.phase = 'assessment' OR EXISTS (SELECT 1 FROM allowance_reservation r
  WHERE r."documentId" = document.id AND r.state = 'active'))`;

const resumable = `"processingAttemptId" IS NOT NULL AND "providerRequests" <> '{}'::jsonb
  AND NOT EXISTS (SELECT 1 FROM jsonb_each("providerRequests") AS request
    WHERE request.value->>'state' NOT IN ('retry', 'succeeded'))`;

const held = `id = $1 AND "claimToken" = $2 AND status = 'processing' AND ${reserved}
  AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()`;

const terminalFailure = `status = 'failed', "processingStage" = NULL, "revisedKey" = NULL, "revisedSize" = NULL,
  "revisionNotices" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL, "editingCompleted" = NULL, "editingTotal" = NULL,
  assessment = CASE WHEN phase = 'rewrite' THEN assessment ELSE NULL END,
  preview = CASE WHEN phase = 'rewrite' THEN preview ELSE NULL END`;

const publication = `status = 'completed', "processingStage" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL,
  "nextRequestAt" = NULL, "editingCompleted" = NULL, "editingTotal" = NULL`;

export interface JobClaim {
  id: string;
  originalKey: string;
  size: number;
  phase: DocumentPhase;
  strength: number | null;
  revisedKey: string | null;
  revisedSize: number | null;
  claimToken: string;
  processingStartedAt: Date;
  processingDeadline: Date;
  processingAttemptId: string;
  providerRequests: Record<string, ProviderRequestCheckpoint>;
  assessment?: DocumentDetection | null;
}

export interface JobDatabase {
  query(sql: string, values?: unknown[]): Promise<unknown[]>;
}

export interface JobTimeouts {
  assessmentTimeoutMs?: number;
  processingTimeoutMs: number;
}

export class DocumentJobs {
  constructor(private readonly database: JobDatabase) {}

  async claim(timeouts: JobTimeouts): Promise<JobClaim | null> {
    const rows = await this.database.query(
      `WITH candidate AS (
        SELECT id FROM document WHERE ${reserved} AND (status = 'queued' OR
          (status = 'processing' AND "leaseExpiresAt" <= clock_timestamp()
            AND "processingDeadline" > clock_timestamp()
            AND ("nextRequestAt" IS NULL OR "nextRequestAt" <= clock_timestamp()) AND ${resumable}))
        ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE document SET status = 'processing', "claimToken" = $1,
          "processingStage" = CASE WHEN status = 'processing' THEN "processingStage"
            WHEN phase = 'assessment' THEN 'assessing' ELSE 'editing' END,
          "processingAttemptId" = CASE WHEN status = 'queued' THEN $4::uuid ELSE "processingAttemptId" END,
          "providerRequests" = CASE WHEN status = 'queued' THEN '{}'::jsonb ELSE "providerRequests" END,
          "processingStartedAt" = CASE WHEN status = 'queued' THEN clock_timestamp() ELSE "processingStartedAt" END,
          "processingDeadline" = CASE WHEN status = 'processing' THEN "processingDeadline"
            ELSE clock_timestamp() + (CASE WHEN phase = 'assessment' THEN $2::int ELSE $3::int END) * interval '1 millisecond' END,
          "nextRequestAt" = NULL,
          "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
        WHERE id IN (SELECT id FROM candidate)
        RETURNING id, "originalKey", size, phase, strength, "revisedKey", "revisedSize", "claimToken",
          "processingStartedAt", "processingDeadline", "processingAttemptId", "providerRequests", assessment
      ) SELECT * FROM claimed`,
      [
        randomUUID(),
        timeouts.assessmentTimeoutMs ?? timeouts.processingTimeoutMs,
        timeouts.processingTimeoutMs,
        randomUUID()
      ]
    );
    return (rows[0] as JobClaim | undefined) ?? null;
  }

  async startRequest(claim: JobClaim, operation: string, inputHash: string): Promise<ProviderRequestCheckpoint | null> {
    const rows = await this.database.query(
      `WITH started AS (
        UPDATE document SET "providerRequests" = jsonb_set("providerRequests", ARRAY[$3],
          jsonb_build_object('inputHash', $4::text, 'state', 'running',
            'attempts', COALESCE(("providerRequests"->$3->>'attempts')::int, 0) + 1))
        WHERE ${held}
          AND ("providerRequests"->$3 IS NULL OR
            ("providerRequests"->$3->>'state' = 'retry' AND "providerRequests"->$3->>'inputHash' = $4
              AND ("providerRequests"->$3->>'attempts')::int < 3))
        RETURNING "providerRequests"->$3 AS checkpoint
      ) SELECT checkpoint FROM started`,
      [claim.id, claim.claimToken, operation, inputHash]
    );
    return (rows[0] as { checkpoint: ProviderRequestCheckpoint } | undefined)?.checkpoint ?? null;
  }

  async saveInitialAssessment(claim: JobClaim, assessment: DocumentDetection): Promise<boolean> {
    const rows = await this.database.query(`UPDATE document SET assessment = $3::jsonb WHERE ${held} RETURNING id`, [
      claim.id,
      claim.claimToken,
      JSON.stringify(assessment)
    ]);
    return rows.length === 1;
  }

  async finishRequest(
    claim: JobClaim,
    operation: string,
    checkpoint: ProviderRequestCheckpoint,
    delayMs?: number
  ): Promise<boolean> {
    const rows = await this.database.query(
      `WITH finished AS (
        UPDATE document SET "providerRequests" = jsonb_set("providerRequests", ARRAY[$3], $4::jsonb),
          "nextRequestAt" = CASE WHEN $5::int IS NULL THEN NULL ELSE clock_timestamp() + $5 * interval '1 millisecond' END,
          "leaseExpiresAt" = CASE WHEN $5::int IS NULL THEN "leaseExpiresAt" ELSE clock_timestamp() END
        WHERE ${held}
          AND "providerRequests"->$3->>'state' = 'running'
          AND "providerRequests"->$3->>'attempts' = $6
          AND "providerRequests"->$3->>'inputHash' = $7
        RETURNING id
      ) SELECT id FROM finished`,
      [
        claim.id,
        claim.claimToken,
        operation,
        JSON.stringify(checkpoint),
        delayMs ?? null,
        String(checkpoint.attempts),
        checkpoint.inputHash
      ]
    );
    return rows.length === 1;
  }

  async publishAssessment(claim: JobClaim, assessment: DocumentDetection, preview: DocumentPreview): Promise<boolean> {
    const rows = await this.database.query(
      `WITH assessed AS (
      UPDATE document SET status = 'assessed', assessment = $3::jsonb, preview = $4::jsonb, "processingStage" = NULL,
        "claimToken" = NULL, "leaseExpiresAt" = NULL, "processingDeadline" = NULL, "nextRequestAt" = NULL
      WHERE ${held} AND phase = 'assessment'
      RETURNING id
    ) SELECT id FROM assessed`,
      [claim.id, claim.claimToken, JSON.stringify(assessment), JSON.stringify(preview)]
    );
    return rows.length === 1;
  }

  async saveRevision(
    claim: JobClaim,
    revised: { key: string; size: number },
    notices: RevisionNotices
  ): Promise<boolean> {
    const rows = await this.database.query(
      `WITH revised AS (
      UPDATE document SET "revisedKey" = $3, "revisedSize" = $4, "revisionNotices" = $5::jsonb
      WHERE ${held} AND phase = 'rewrite' AND "revisedKey" IS NULL
      RETURNING id
    ) SELECT id FROM revised`,
      [claim.id, claim.claimToken, revised.key, revised.size, JSON.stringify(notices)]
    );
    return rows.length === 1;
  }

  async complete(claim: JobClaim): Promise<boolean> {
    const rows = await this.database.query(
      `WITH completed AS (
      UPDATE document SET ${publication}
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing' AND phase = 'rewrite' AND ${reserved}
        AND "revisedKey" IS NOT NULL AND "leaseExpiresAt" > clock_timestamp()
      RETURNING id
    ), charged AS (
      UPDATE allowance_reservation SET state = 'charged'
      WHERE "documentId" IN (SELECT id FROM completed) AND state = 'active'
      RETURNING id
    ) SELECT id FROM completed`,
      [claim.id, claim.claimToken]
    );
    return rows.length === 1;
  }

  async stage(claim: JobClaim, stage: ProcessingStage): Promise<boolean> {
    const rows = await this.database.query(
      `WITH advanced AS (
      UPDATE document SET "processingStage" = $3 WHERE ${held}
      RETURNING id
    ) SELECT id FROM advanced`,
      [claim.id, claim.claimToken, stage]
    );
    return rows.length === 1;
  }

  async progress(claim: JobClaim, completed: number, total: number): Promise<boolean> {
    const rows = await this.database.query(
      `WITH advanced AS (
      UPDATE document SET "editingCompleted" = $3, "editingTotal" = $4 WHERE ${held} AND phase = 'rewrite'
      RETURNING id
    ) SELECT id FROM advanced`,
      [claim.id, claim.claimToken, completed, total]
    );
    return rows.length === 1;
  }

  async ownsRevision(id: string, key: string): Promise<boolean> {
    const rows = await this.database.query(`SELECT id FROM document WHERE id = $1 AND "revisedKey" = $2`, [id, key]);
    return rows.length === 1;
  }

  async heartbeat(claim: JobClaim): Promise<boolean> {
    const rows = await this.database.query(
      `WITH renewed AS (
      UPDATE document SET "leaseExpiresAt" = clock_timestamp() + interval '30 seconds' WHERE ${held}
      RETURNING id
    ) SELECT id FROM renewed`,
      [claim.id, claim.claimToken]
    );
    return rows.length === 1;
  }

  async recover(): Promise<number> {
    const rows = await this.database.query(`WITH expired AS (
      SELECT id, "revisedKey" IS NOT NULL AS usable, "processingDeadline" <= clock_timestamp() AS late FROM document
      WHERE status = 'processing' AND ("processingDeadline" <= clock_timestamp() OR
        ("leaseExpiresAt" <= clock_timestamp() AND NOT (${resumable})))
      FOR UPDATE SKIP LOCKED
    ), published AS (
      UPDATE document SET ${publication}
      WHERE id IN (SELECT id FROM expired WHERE usable)
      RETURNING id
    ), charged AS (
      UPDATE allowance_reservation SET state = 'charged'
      WHERE "documentId" IN (SELECT id FROM published) AND state = 'active'
      RETURNING id
    ), recovered AS (
      UPDATE document SET ${terminalFailure},
        "failureCode" = CASE WHEN (SELECT late FROM expired WHERE expired.id = document.id) THEN 'deadline' ELSE 'interrupted' END
      WHERE id IN (SELECT id FROM expired WHERE NOT usable)
      RETURNING id
    ), released AS (
      UPDATE allowance_reservation SET state = 'released'
      WHERE "documentId" IN (SELECT id FROM recovered) AND state = 'active'
      RETURNING id
    ) SELECT id FROM published UNION ALL SELECT id FROM recovered`);
    return rows.length;
  }

  async fail(claim: JobClaim, reason: ProcessingFailure): Promise<boolean> {
    const rows = await this.database.query(
      `WITH failed AS (
      UPDATE document SET ${terminalFailure},
        "failureCode" = CASE WHEN "processingDeadline" <= clock_timestamp() THEN 'deadline' ELSE $3 END
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
      RETURNING id
    ), released AS (
      UPDATE allowance_reservation SET state = 'released'
      WHERE "documentId" IN (SELECT id FROM failed) AND state = 'active'
      RETURNING id
    ) SELECT id FROM failed`,
      [claim.id, claim.claimToken, reason]
    );
    return rows.length === 1;
  }
}
