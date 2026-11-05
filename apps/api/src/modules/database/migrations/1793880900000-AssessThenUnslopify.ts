import { MigrationInterface } from 'typeorm';

const failureCodes = `('provider', 'deadline', 'interrupted', 'response', 'structure', 'formatting', 'protected', 'citation', 'quotation', 'reference', 'fact', 'language')`;

export class AssessThenUnslopify1793880900000 implements MigrationInterface {
  async up(database: { query(sql: string): Promise<unknown> }): Promise<void> {
    await database.query(`ALTER TABLE document
      DROP CONSTRAINT "CHK_document_processing",
      DROP CONSTRAINT "CHK_document_revision",
      DROP CONSTRAINT "CHK_document_stage",
      DROP CONSTRAINT "CHK_document_revision_notices",
      ADD COLUMN phase varchar NOT NULL DEFAULT 'assessment',
      ADD COLUMN strength integer,
      ADD COLUMN "finalAssessment" jsonb,
      ADD COLUMN preview jsonb,
      ADD COLUMN "editingCompleted" integer,
      ADD COLUMN "editingTotal" integer`);
    await database.query(`UPDATE document SET phase = 'rewrite' WHERE status = 'completed'`);
    await database.query(`UPDATE allowance_reservation SET state = 'released'
      WHERE state = 'active' AND "documentId" IN (SELECT id FROM document WHERE status IN ('queued', 'processing'))`);
    await database.query(`UPDATE document SET status = 'queued', phase = 'assessment', assessment = NULL,
      "claimToken" = NULL, "leaseExpiresAt" = NULL, "processingStage" = NULL, "nextRequestAt" = NULL,
      "processingAttemptId" = NULL, "providerRequests" = '{}'::jsonb, "processingStartedAt" = NULL,
      "processingDeadline" = NULL WHERE status IN ('queued', 'processing')`);
    await database.query(`ALTER TABLE document
      ADD CONSTRAINT "CHK_document_processing" CHECK (
        (status = 'stored' AND phase = 'assessment' AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'queued' AND "failureCode" IS NULL AND "claimToken" IS NULL AND ((phase = 'assessment' AND assessment IS NULL) OR (phase = 'rewrite' AND assessment IS NOT NULL))) OR
        (status = 'processing' AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND ((phase = 'assessment' AND assessment IS NULL) OR (phase = 'rewrite' AND assessment IS NOT NULL))) OR
        (status = 'assessed' AND phase = 'assessment' AND assessment IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL AND "processingDeadline" IS NULL) OR
        (status = 'completed' AND phase = 'rewrite' AND assessment IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'failed' AND "failureCode" IN ${failureCodes} AND "claimToken" IS NULL AND ((phase = 'assessment' AND assessment IS NULL) OR (phase = 'rewrite' AND assessment IS NOT NULL)))
      ),
      ADD CONSTRAINT "CHK_document_phase" CHECK (
        phase IN ('assessment', 'rewrite') AND (strength IS NULL OR (strength >= 1 AND strength <= 100)) AND (phase = 'rewrite' OR strength IS NULL)
      ),
      ADD CONSTRAINT "CHK_document_stage" CHECK (
        "processingStage" IS NULL OR (status = 'processing' AND (
          (phase = 'assessment' AND "processingStage" = 'assessing') OR
          (phase = 'rewrite' AND "processingStage" IN ('editing', 'validating', 'final-assessment'))
        ))
      ),
      ADD CONSTRAINT "CHK_document_revision" CHECK (
        ("revisedKey" IS NULL AND "revisedSize" IS NULL AND "revisionNotices" IS NULL AND status <> 'completed') OR
        ("revisedKey" IS NOT NULL AND "revisedKey" <> "originalKey" AND "revisedSize" IS NOT NULL AND "revisedSize" > 0 AND "revisedSize" <= 10000000 AND status IN ('processing', 'completed') AND phase = 'rewrite')
      ),
      ADD CONSTRAINT "CHK_document_revision_notices" CHECK (
        "revisionNotices" IS NULL OR ("revisedKey" IS NOT NULL AND jsonb_typeof("revisionNotices") = 'object')
      ),
      ADD CONSTRAINT "CHK_document_final_assessment" CHECK (
        "finalAssessment" IS NULL OR (status = 'completed' AND jsonb_typeof("finalAssessment") = 'object')
      ),
      ADD CONSTRAINT "CHK_document_preview" CHECK (
        preview IS NULL OR (assessment IS NOT NULL AND jsonb_typeof(preview) = 'object')
      ),
      ADD CONSTRAINT "CHK_document_progress" CHECK (
        ("editingCompleted" IS NULL AND "editingTotal" IS NULL) OR
        (status = 'processing' AND phase = 'rewrite' AND "editingTotal" >= 0 AND "editingCompleted" >= 0 AND "editingCompleted" <= "editingTotal")
      )`);
  }

  async down(database: { query(sql: string): Promise<unknown> }): Promise<void> {
    await database.query(`ALTER TABLE document
      DROP CONSTRAINT "CHK_document_processing",
      DROP CONSTRAINT "CHK_document_phase",
      DROP CONSTRAINT "CHK_document_stage",
      DROP CONSTRAINT "CHK_document_revision",
      DROP CONSTRAINT "CHK_document_revision_notices",
      DROP CONSTRAINT "CHK_document_final_assessment",
      DROP CONSTRAINT "CHK_document_preview",
      DROP CONSTRAINT "CHK_document_progress"`);
    await database.query(`UPDATE allowance_reservation SET state = 'released'
      WHERE state = 'active' AND "documentId" IN (SELECT id FROM document WHERE status IN ('queued', 'processing'))`);
    await database.query(`UPDATE document SET status = 'failed', "failureCode" = 'interrupted', assessment = NULL,
      "claimToken" = NULL, "leaseExpiresAt" = NULL, "processingStage" = NULL, "nextRequestAt" = NULL,
      "providerRequests" = '{}'::jsonb, "revisedKey" = NULL, "revisedSize" = NULL, "revisionNotices" = NULL
      WHERE status IN ('queued', 'processing')`);
    await database.query(`UPDATE document SET assessment = NULL WHERE status = 'failed'`);
    await database.query(`ALTER TABLE document
      DROP COLUMN phase, DROP COLUMN strength, DROP COLUMN "finalAssessment", DROP COLUMN preview,
      DROP COLUMN "editingCompleted", DROP COLUMN "editingTotal",
      ADD CONSTRAINT "CHK_document_processing" CHECK (
        (status IN ('stored', 'queued') AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'processing' AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
        (status IN ('assessed', 'completed') AND assessment IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'failed' AND assessment IS NULL AND "failureCode" IN ${failureCodes} AND "failureCode" IS NOT NULL AND "claimToken" IS NULL)
      ),
      ADD CONSTRAINT "CHK_document_revision" CHECK (
        (status = 'completed' AND "revisedKey" IS NOT NULL AND "revisedKey" <> "originalKey" AND "revisedSize" IS NOT NULL AND "revisedSize" > 0 AND "revisedSize" <= 10000000) OR
        (status <> 'completed' AND "revisedKey" IS NULL AND "revisedSize" IS NULL)
      ),
      ADD CONSTRAINT "CHK_document_stage" CHECK (
        "processingStage" IS NULL OR (status = 'processing' AND "processingStage" IN ('assessing', 'editing', 'validating'))
      ),
      ADD CONSTRAINT "CHK_document_revision_notices" CHECK (
        "revisionNotices" IS NULL OR (status = 'completed' AND jsonb_typeof("revisionNotices") = 'object')
      )`);
  }
}
