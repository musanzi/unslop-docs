import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentAssessment1793880300000 implements MigrationInterface {
  async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(`ALTER TABLE "document"
      ADD COLUMN "status" varchar NOT NULL DEFAULT 'stored',
      ADD COLUMN "claimToken" uuid,
      ADD COLUMN "processingStartedAt" timestamptz,
      ADD COLUMN "processingDeadline" timestamptz,
      ADD COLUMN "leaseExpiresAt" timestamptz,
      ADD COLUMN "assessment" jsonb,
      ADD COLUMN "failureCode" varchar,
      ADD CONSTRAINT "CHK_document_processing" CHECK (
        (status = 'stored' AND "assessment" IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'queued' AND "assessment" IS NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'processing' AND "assessment" IS NULL AND "failureCode" IS NULL AND "claimToken" IS NOT NULL AND "processingDeadline" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
        (status = 'assessed' AND "assessment" IS NOT NULL AND "failureCode" IS NULL AND "claimToken" IS NULL) OR
        (status = 'failed' AND "assessment" IS NULL AND "failureCode" IN ('provider', 'deadline', 'interrupted') AND "failureCode" IS NOT NULL AND "claimToken" IS NULL)
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_document_queue" ON "document" ("createdAt", id) WHERE status = 'queued'`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_document_recovery" ON "document" ("leaseExpiresAt", "processingDeadline") WHERE status = 'processing'`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_document_recovery"`);
    await queryRunner.query(`DROP INDEX "IDX_document_queue"`);
    await queryRunner.query(`ALTER TABLE "document" DROP CONSTRAINT "CHK_document_processing",
      DROP COLUMN "failureCode", DROP COLUMN "assessment", DROP COLUMN "leaseExpiresAt",
      DROP COLUMN "processingDeadline", DROP COLUMN "processingStartedAt", DROP COLUMN "claimToken", DROP COLUMN "status"`);
  }
}
