import { ProcessingFailure } from '../documents/document-processing';
import { randomUUID } from 'node:crypto';
import { WritingAssessment } from '../documents/assessment-workflow';

export interface JobClaim {
  id: string;
  originalKey: string;
  size: number;
  claimToken: string;
  processingStartedAt: Date;
  processingDeadline: Date;
}

export interface JobDatabase {
  query(sql: string, values?: unknown[]): Promise<unknown[]>;
}

export class DocumentJobs {
  constructor(private readonly database: JobDatabase) {}

  async claim(processingTimeoutMs: number): Promise<JobClaim | null> {
    const rows = await this.database.query(
      `WITH candidate AS (
        SELECT id FROM document WHERE status = 'queued' ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE document SET status = 'processing', "claimToken" = $1,
          "processingStartedAt" = clock_timestamp(),
          "processingDeadline" = clock_timestamp() + $2 * interval '1 millisecond',
          "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
        WHERE id IN (SELECT id FROM candidate) AND status = 'queued'
        RETURNING id, "originalKey", size, "claimToken", "processingStartedAt", "processingDeadline"
      ) SELECT * FROM claimed`,
      [randomUUID(), processingTimeoutMs]
    );
    return (rows[0] as JobClaim | undefined) ?? null;
  }

  async complete(claim: JobClaim, assessment: WritingAssessment): Promise<boolean> {
    const rows = await this.database.query(
      `WITH completed AS (
      UPDATE document SET status = 'assessed', assessment = $3::jsonb, "claimToken" = NULL, "leaseExpiresAt" = NULL
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
        AND "processingDeadline" > clock_timestamp() AND "leaseExpiresAt" > clock_timestamp()
      RETURNING id
    ) SELECT id FROM completed`,
      [claim.id, claim.claimToken, JSON.stringify(assessment)]
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
      UPDATE document SET status = 'failed', assessment = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL,
        "failureCode" = CASE WHEN "processingDeadline" <= clock_timestamp() THEN 'deadline' ELSE 'interrupted' END
      WHERE status = 'processing' AND ("processingDeadline" <= clock_timestamp() OR "leaseExpiresAt" <= clock_timestamp())
      RETURNING id
    ) SELECT id FROM recovered`);
    return rows.length;
  }

  async fail(claim: JobClaim, reason: ProcessingFailure): Promise<boolean> {
    const rows = await this.database.query(
      `WITH failed AS (
      UPDATE document SET status = 'failed', assessment = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL,
        "failureCode" = CASE WHEN "processingDeadline" <= clock_timestamp() THEN 'deadline' ELSE $3 END
      WHERE id = $1 AND "claimToken" = $2 AND status = 'processing'
      RETURNING id
    ) SELECT id FROM failed`,
      [claim.id, claim.claimToken, reason]
    );
    return rows.length === 1;
  }
}
