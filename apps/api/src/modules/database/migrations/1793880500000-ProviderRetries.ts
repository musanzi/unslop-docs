import { MigrationInterface } from 'typeorm';

export class ProviderRetries1793880500000 implements MigrationInterface {
  async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(`ALTER TABLE document
      ADD COLUMN "processingAttemptId" uuid,
      ADD COLUMN "providerRequests" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN "nextRequestAt" timestamptz,
      ADD CONSTRAINT "CHK_document_provider_requests" CHECK (jsonb_typeof("providerRequests") = 'object')`);
  }

  async down(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(`UPDATE document SET status = 'failed', "failureCode" = 'interrupted',
      assessment = NULL, "processingStage" = NULL, "claimToken" = NULL, "leaseExpiresAt" = NULL
      WHERE status = 'processing' AND "processingAttemptId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE document DROP CONSTRAINT "CHK_document_provider_requests",
      DROP COLUMN "processingAttemptId", DROP COLUMN "providerRequests", DROP COLUMN "nextRequestAt"`);
  }
}
