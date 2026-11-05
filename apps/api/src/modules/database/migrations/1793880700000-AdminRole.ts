import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminRole1793880700000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "role" ("name") VALUES ('admin') ON CONFLICT ("name") DO NOTHING`);
  }

  async down(): Promise<void> {
    // Preserve role records that may have existed before this migration.
  }
}
