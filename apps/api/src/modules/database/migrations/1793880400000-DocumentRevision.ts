import { MigrationInterface } from 'typeorm';

export class DocumentRevision1793880400000 implements MigrationInterface {
  async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(`ALTER TABLE document DROP CONSTRAINT "CHK_document_processing",
      ADD COLUMN "revisedKey" varchar UNIQUE,
      ADD COLUMN "revisedSize" integer,
      ADD COLUMN "processingStage" varchar,
      ADD CONSTRAINT "CHK_document_processing" CHECK (
        (status IN ('stored', 'queued') AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'processing' AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
        (status IN ('assessed', 'completed') AND assessment IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'failed' AND assessment IS NULL AND "failureCode" IN ('provider', 'deadline', 'interrupted', 'response', 'structure', 'formatting', 'protected', 'citation', 'quotation', 'reference', 'fact', 'language') AND "failureCode" IS NOT NULL AND "claimToken" IS NULL)
      ),
      ADD CONSTRAINT "CHK_document_revision" CHECK (
        (status = 'completed' AND "revisedKey" IS NOT NULL AND "revisedKey" <> "originalKey" AND "revisedSize" IS NOT NULL AND "revisedSize" > 0 AND "revisedSize" <= 10000000) OR
        (status <> 'completed' AND "revisedKey" IS NULL AND "revisedSize" IS NULL)
      ),
      ADD CONSTRAINT "CHK_document_stage" CHECK (
        "processingStage" IS NULL OR (status = 'processing' AND "processingStage" IN ('assessing', 'editing', 'validating'))
      )`);
  }

  async down(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE document DROP CONSTRAINT "CHK_document_revision", DROP CONSTRAINT "CHK_document_stage", DROP CONSTRAINT "CHK_document_processing"`
    );
    await queryRunner.query(`UPDATE document SET status = 'assessed' WHERE status = 'completed'`);
    await queryRunner.query(
      `UPDATE document SET "failureCode" = 'provider' WHERE status = 'failed' AND "failureCode" NOT IN ('provider', 'deadline', 'interrupted')`
    );
    await queryRunner.query(`ALTER TABLE document DROP COLUMN "revisedKey", DROP COLUMN "revisedSize", DROP COLUMN "processingStage",
      ADD CONSTRAINT "CHK_document_processing" CHECK (
        (status IN ('stored', 'queued') AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'processing' AND assessment IS NULL AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
        (status = 'assessed' AND assessment IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'failed' AND assessment IS NULL AND "failureCode" IN ('provider', 'deadline', 'interrupted') AND "failureCode" IS NOT NULL AND "claimToken" IS NULL)
      )`);
  }
}
