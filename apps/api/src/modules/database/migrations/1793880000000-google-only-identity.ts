import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleOnlyIdentity1793880000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "password"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "googleSubject" character varying`);
    await queryRunner.query(`ALTER TABLE "user" ADD "googleEmailVerified" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "UQ_user_googleSubject" UNIQUE ("googleSubject")`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22"`);
    await queryRunner.query(`INSERT INTO "role" ("name") VALUES ('user') ON CONFLICT ("name") DO NOTHING`);
    await queryRunner.query(`DELETE FROM "user_roles"`);
    await queryRunner.query(
      `INSERT INTO "user_roles" ("userId", "roleId") SELECT "user"."id", "role"."id" FROM "user" CROSS JOIN "role" WHERE "role"."name" = 'user'`
    );
  }

  async down(): Promise<void> {
    throw new Error('Google-only identity migration is irreversible: removed credentials cannot be restored');
  }
}
