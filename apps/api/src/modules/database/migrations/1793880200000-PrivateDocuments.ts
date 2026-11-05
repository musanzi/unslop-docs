import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateDocuments1793880200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "document" (
      "id" uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL,
      "filename" character varying(240) NOT NULL,
      "originalKey" character varying NOT NULL UNIQUE,
      "size" integer NOT NULL CHECK ("size" > 0 AND "size" <= 10000000),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "FK_document_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_document_owner_history" ON "document" ("ownerId", "createdAt" DESC, "id" DESC)`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "document"');
  }
}
