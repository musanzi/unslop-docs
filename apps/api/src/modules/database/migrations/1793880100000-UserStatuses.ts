import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserStatuses1793880100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "user_status" AS ENUM ('FREE', 'PREMIUM', 'GOLD')`);
    await queryRunner.query(`ALTER TABLE "user" ADD "status" "user_status" NOT NULL DEFAULT 'FREE'`);
    await queryRunner.query(`CREATE TABLE "status_change" (
      "id" BIGSERIAL PRIMARY KEY,
      "userId" uuid NOT NULL,
      "adminId" uuid NOT NULL,
      "adminEmail" character varying NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
      "previousStatus" "user_status" NOT NULL,
      "newStatus" "user_status" NOT NULL,
      CONSTRAINT "FK_status_change_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_status_change_admin" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_status_change_user_history" ON "status_change" ("userId", "createdAt", "id")`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "status_change"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "user_status"`);
  }
}
