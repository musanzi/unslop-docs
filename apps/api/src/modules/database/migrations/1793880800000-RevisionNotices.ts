import { MigrationInterface } from 'typeorm';

export class RevisionNotices1793880800000 implements MigrationInterface {
  async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(`ALTER TABLE document
      ADD COLUMN "revisionNotices" jsonb,
      ADD CONSTRAINT "CHK_document_revision_notices" CHECK (
        "revisionNotices" IS NULL OR (status = 'completed' AND jsonb_typeof("revisionNotices") = 'object')
      )`);
  }

  async down(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE document DROP CONSTRAINT "CHK_document_revision_notices", DROP COLUMN "revisionNotices"`
    );
  }
}
