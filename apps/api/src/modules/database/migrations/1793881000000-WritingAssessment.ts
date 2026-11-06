import { MigrationInterface } from 'typeorm';

const failureCodes = `('provider', 'deadline', 'interrupted', 'response', 'structure', 'formatting', 'protected', 'citation', 'quotation', 'reference', 'fact', 'language')`;

export class WritingAssessment1793881000000 implements MigrationInterface {
  async up(runner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await runner.query(
      `ALTER TABLE document DROP CONSTRAINT "CHK_document_processing", DROP CONSTRAINT "CHK_document_preview"`
    );
    await runner.query(`UPDATE document SET assessment = NULL, "finalAssessment" = NULL,
      "providerRequests" = COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each("providerRequests")
        WHERE key LIKE 'edit:%'), '{}'::jsonb)`);
    await runner.query(`ALTER TABLE document ADD CONSTRAINT "CHK_document_processing" CHECK (
      (status = 'stored' AND phase = 'assessment' AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
      (status = 'queued' AND "failureCode" IS NULL AND "claimToken" IS NULL AND (phase = 'rewrite' OR assessment IS NULL)) OR
      (status = 'processing' AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND (phase = 'rewrite' OR assessment IS NULL)) OR
      (status = 'assessed' AND phase = 'assessment' AND "failureCode" IS NULL AND "claimToken" IS NULL AND "processingDeadline" IS NULL) OR
      (status = 'completed' AND phase = 'rewrite' AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
      (status = 'failed' AND "failureCode" IN ${failureCodes} AND "claimToken" IS NULL AND (phase = 'rewrite' OR assessment IS NULL))
    ), ADD CONSTRAINT "CHK_document_preview" CHECK (preview IS NULL OR jsonb_typeof(preview) = 'object')`);
  }

  async down(): Promise<void> {
    throw new Error(
      'Deleted detector results cannot be restored. Restore the coordinated pre-deployment backup to roll back.'
    );
  }
}
