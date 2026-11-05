import { ProcessingStage } from '../documents/document-workflow';
import { ProcessingFailure } from '../documents/document-processing';
import { randomUUID } from 'node:crypto';
import { WritingAssessment } from '../documents/assessment-workflow';
import { ProviderFailureCategory } from '../documents/provider-failure';

export interface ProviderRequestCheckpoint {
  inputHash: string;
  attempts: number;
  state: 'running' | 'retry' | 'succeeded' | 'failed';
  outcome?: unknown;
  failure?: { category: ProviderFailureCategory; status?: number };
}

const resumable = `"processingAttemptId" IS NOT NULL AND "providerRequests" <> '{}'::jsonb
  AND NOT EXISTS (SELECT 1 FROM jsonb_each("providerRequests") AS request
    WHERE request.value->>'state' NOT IN ('retry', 'succeeded'))`;

export interface JobClaim {
  id: string;
  originalKey: string;
  size: number;
  claimToken: string;
  processingStartedAt: Date;
  processingDeadline: Date;
  processingAttemptId: string;
  providerRequests: Record<string, ProviderRequestCheckpoint>;
}

export interface JobDatabase {
  query(sql: string, values?: unknown[]): Promise<unknown[]>;
}

export class DocumentJobs {
  constructor(private readonly database: JobDatabase) {}

  async claim(processingTimeoutMs: number): Promise<JobClaim | null> {
    const rows = await this.database.query(
      `WITH candidate AS (
        SELECT id FROM document WHERE status = 'queued' OR
          (status = 'processing' AND "leaseExpiresAt" <= clock_timestamp()
            AND "processingDeadline" > clock_timestamp()
            AND ("nextRequestAt" IS NULL OR "nextRequestAt" <= clock_timestamp()) AND ${resumable})
        ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE document SET status = 'processing', "processingStage" = 'assessing', "claimToken" = $1,
          "processingAttemptId" = CASE WHEN status = 'queued' THEN $3::uuid ELSE "processingAttemptId" END,
          "providerRequests" = CASE WHEN status = 'queued' THEN '{}'::jsonb ELSE "providerRequests" END,
          "processingStartedAt" = CASE WHEN status = 'queued' THEN clock_timestamp() ELSE "processingStartedAt" END,
          "processingDeadline" = CASE WHEN status = 'queued' THEN clock_timestamp() + $2 * interval '1 millisecond' ELSE "processingDeadline" END,
          "nextRequestAt" = NULL,
          "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
        WHERE id IN (SELECT id FROM candidate)
        RETURNING id, "originalKey", size, "claimToken", "processingStartedAt", "processingDeadline", "processingAttemptId", "providerRequests"
      ) SELECT * FROM claimed`,
      [randomUUID(), processingTimeoutMs, randomUUID()]
    );
    return (rows[0] as JobClaim | undefined) ?? null;
  }

  async startRequest(claim: JobClaim, operation: string, inputHash: string): Promise<ProviderRequestCheckpoint | null> {
    const rows = await this.database.query(
      `WITH started AS (
        UPDATE document SET "providerRequests" = jsonb_set("providerRequests", ARRAY[$3],
          jsonb_build_object('inputHash', $4::text, 'state', 'running',
            'attempts', COALESCE(("providerRequests"->$3->>'attempts')::int, 0) + 1))
        WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
          AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
          AND ("providerRequests"->$3 IS NULL OR
            ("providerRequests"->$3->>'state' = 'retry' AND "providerRequests"->$3->>'inputHash' = $4
              AND ("providerRequests"->$3->>'attempts')::int < 3))
        RETURNING "providerRequests"->$3 AS checkpoint
      ) SELECT checkpoint FROM started`,
      [claim.id, claim.claimToken, operation, inputHash]
    );
    return (rows[0] as { checkpoint: ProviderRequestCheckpoint } | undefined)?.checkpoint ?? null;
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
        WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
          AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
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

  async complete(
    claim: JobClaim,
    assessment: WritingAssessment,
    revised: { key: string; size: number }
  ): Promise<boolean> {
    const rows = await this.database.query(
      `WITH completed AS (
      UPDATE document SET status = 'completed', assessment = $3::jsonb, "revisedKey" = $4, "revisedSize" = $5, "processingStage" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
        AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
      RETURNING id
    ) SELECT id FROM completed`,
      [claim.id, claim.claimToken, JSON.stringify(assessment), revised.key, revised.size]
    );
    return rows.length === 1;
  }
  async stage(claim: JobClaim, stage: ProcessingStage): Promise<boolean> {
    const rows = await this.database.query(
      `WITH advanced AS (
      UPDATE document SET "processingStage" = $3
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
        AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
      RETURNING id
    ) SELECT id FROM advanced`,
      [claim.id, claim.claimToken, stage]
    );
    return rows.length === 1;
  }

  async isPublished(id: string, key: string): Promise<boolean> {
    const rows = await this.database.query(
      `SELECT id FROM document WHERE id = $1 AND status = 'completed' AND "revisedKey" = $2`,
      [id, key]
    );
    return rows.length === 1;
  }

  async heartbeat(claim: JobClaim): Promise<boolean> {
    const rows = await this.database.query(
      `WITH renewed AS (
      UPDATE document SET "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
        AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
      RETURNING id
    ) SELECT id FROM renewed`,
      [claim.id, claim.claimToken]
    );
    return rows.length === 1;
  }

  async recover(): Promise<number> {
    const rows = await this.database.query(`WITH recovered AS (
      UPDATE document SET status = 'failed', assessment = NULL, "processingStage" = NULL, "revisedKey" = NULL, "revisedSize" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL,
        "failureCode" = CASE WHEN "processingDeadline" <= clock_timestamp() THEN 'deadline' ELSE 'interrupted' END
      WHERE status = 'processing' AND ("processingDeadline" <= clock_timestamp() OR
        ("leaseExpiresAt" <= clock_timestamp() AND NOT (${resumable})))
      RETURNING id
    ) SELECT id FROM recovered`);
    return rows.length;
  }

  async fail(claim: JobClaim, reason: ProcessingFailure): Promise<boolean> {
    const rows = await this.database.query(
      `WITH failed AS (
      UPDATE document SET status = 'failed', assessment = NULL, "processingStage" = NULL, "revisedKey" = NULL, "revisedSize" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL,
        "failureCode" = CASE WHEN "processingDeadline" <= clock_timestamp() THEN 'deadline' ELSE $3 END
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
      RETURNING id
    ) SELECT id FROM failed`,
      [claim.id, claim.claimToken, reason]
    );
    return rows.length === 1;
  }
}
