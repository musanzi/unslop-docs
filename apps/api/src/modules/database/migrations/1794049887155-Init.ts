import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1794049887155 implements MigrationInterface {
  name = 'Init1794049887155';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "role" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "name" character varying(50) NOT NULL, CONSTRAINT "UQ_ae4578dcaed5adff96595e61660" UNIQUE ("name"), CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE TYPE "public"."user_status" AS ENUM('FREE', 'PREMIUM', 'GOLD')`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "status" "public"."user_status" NOT NULL DEFAULT 'FREE', "email" character varying NOT NULL, "name" character varying NOT NULL, "googleSubject" character varying, "googleEmailVerified" boolean NOT NULL DEFAULT false, "avatar" character varying, CONSTRAINT "UQ_d501e1eaf0a9721713fc03de3e4" UNIQUE ("googleSubject"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "status_change" ("id" BIGSERIAL NOT NULL, "userId" uuid NOT NULL, "adminId" uuid NOT NULL, "adminEmail" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(), "previousStatus" "public"."user_status" NOT NULL, "newStatus" "public"."user_status" NOT NULL, CONSTRAINT "PK_c24e2142db7320c7da70a806f45" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_status_change_user_history" ON "status_change"  ("userId", "createdAt", "id") `
    );
    await queryRunner.query(
      `CREATE TABLE "document" ("id" uuid NOT NULL, "ownerId" uuid NOT NULL, "filename" character varying(240) NOT NULL, "originalKey" character varying NOT NULL, "revisedKey" character varying, "revisedSize" integer, "revisionNotices" jsonb, "processingStage" character varying, "size" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'stored', "phase" character varying NOT NULL DEFAULT 'assessment', "strength" integer, "editingCompleted" integer, "editingTotal" integer, "claimToken" uuid, "processingAttemptId" uuid, "providerRequests" jsonb NOT NULL DEFAULT '{}', "nextRequestAt" TIMESTAMP WITH TIME ZONE, "processingStartedAt" TIMESTAMP WITH TIME ZONE, "processingDeadline" TIMESTAMP WITH TIME ZONE, "leaseExpiresAt" TIMESTAMP WITH TIME ZONE, "assessment" jsonb, "preview" jsonb, "failureCode" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3b3edd3795c3c603a763eea27ac" UNIQUE ("originalKey"), CONSTRAINT "UQ_d31667cb72dededc6119905f8a8" UNIQUE ("revisedKey"), CONSTRAINT "PK_e57d3357f83f3cdc0acffc3d777" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_document_owner_history" ON "document" ("ownerId", "createdAt" DESC, "id" DESC)`
    );
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("userId" uuid NOT NULL, "roleId" uuid NOT NULL, CONSTRAINT "PK_88481b0c4ed9ada47e9fdd67475" PRIMARY KEY ("userId", "roleId"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_472b25323af01488f1f66a06b6" ON "user_roles"  ("userId") `);
    await queryRunner.query(`CREATE INDEX "IDX_86033897c009fcca8b6505d6be" ON "user_roles"  ("roleId") `);
    await queryRunner.query(
      `ALTER TABLE "status_change" ADD CONSTRAINT "FK_status_change_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "status_change" ADD CONSTRAINT "FK_status_change_admin" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "document" ADD CONSTRAINT "FK_2d617266bd4cbb6ebcfdb5f67e2" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_472b25323af01488f1f66a06b67" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_86033897c009fcca8b6505d6be2" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(`CREATE TABLE allowance_reservation (
      id uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      "documentId" uuid REFERENCES document(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
      "reservedAt" timestamp with time zone NOT NULL,
      month date NOT NULL,
      state character varying NOT NULL,
      CONSTRAINT allowance_reservation_check CHECK (state <> 'active' OR "documentId" IS NOT NULL),
      CONSTRAINT allowance_reservation_month_check CHECK (EXTRACT(day FROM month) = 1),
      CONSTRAINT allowance_reservation_state_check CHECK (state IN ('active', 'charged', 'released'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_allowance_active_document" ON allowance_reservation USING btree ("documentId") WHERE ((state)::text = 'active'::text)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_allowance_owner_month" ON allowance_reservation USING btree ("ownerId", month) WHERE ((state)::text = ANY ((ARRAY['active'::character varying, 'charged'::character varying])::text[]))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_document_queue" ON document USING btree ("createdAt", id) WHERE ((status)::text = 'queued'::text)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_document_recovery" ON document USING btree ("leaseExpiresAt", "processingDeadline") WHERE ((status)::text = 'processing'::text)`
    );
    await queryRunner.query(`ALTER TABLE document
      ADD CONSTRAINT "CHK_document_phase" CHECK ((((phase)::text = ANY ((ARRAY['assessment'::character varying, 'rewrite'::character varying])::text[])) AND ((strength IS NULL) OR ((strength >= 1) AND (strength <= 100))) AND (((phase)::text = 'rewrite'::text) OR (strength IS NULL)))),
      ADD CONSTRAINT "CHK_document_preview" CHECK (((preview IS NULL) OR (jsonb_typeof(preview) = 'object'::text))),
      ADD CONSTRAINT "CHK_document_processing" CHECK (((((status)::text = 'stored'::text) AND ((phase)::text = 'assessment'::text) AND (assessment IS NULL) AND ("failureCode" IS NULL) AND ("claimToken" IS NULL)) OR (((status)::text = 'queued'::text) AND ("failureCode" IS NULL) AND ("claimToken" IS NULL) AND (((phase)::text = 'rewrite'::text) OR (assessment IS NULL))) OR (((status)::text = 'processing'::text) AND ("failureCode" IS NULL) AND ("claimToken" IS NOT NULL) AND ("processingDeadline" IS NOT NULL) AND ("leaseExpiresAt" IS NOT NULL) AND (((phase)::text = 'rewrite'::text) OR (assessment IS NULL))) OR (((status)::text = 'assessed'::text) AND ((phase)::text = 'assessment'::text) AND ("failureCode" IS NULL) AND ("claimToken" IS NULL) AND ("processingDeadline" IS NULL)) OR (((status)::text = 'completed'::text) AND ((phase)::text = 'rewrite'::text) AND ("failureCode" IS NULL) AND ("claimToken" IS NULL)) OR (((status)::text = 'failed'::text) AND (("failureCode")::text = ANY ((ARRAY['provider'::character varying, 'deadline'::character varying, 'interrupted'::character varying, 'response'::character varying, 'structure'::character varying, 'formatting'::character varying, 'protected'::character varying, 'citation'::character varying, 'quotation'::character varying, 'reference'::character varying, 'fact'::character varying, 'language'::character varying])::text[])) AND ("claimToken" IS NULL) AND (((phase)::text = 'rewrite'::text) OR (assessment IS NULL))))),
      ADD CONSTRAINT "CHK_document_progress" CHECK (((("editingCompleted" IS NULL) AND ("editingTotal" IS NULL)) OR (((status)::text = 'processing'::text) AND ((phase)::text = 'rewrite'::text) AND ("editingTotal" >= 0) AND ("editingCompleted" >= 0) AND ("editingCompleted" <= "editingTotal")))),
      ADD CONSTRAINT "CHK_document_provider_requests" CHECK ((jsonb_typeof("providerRequests") = 'object'::text)),
      ADD CONSTRAINT "CHK_document_revision" CHECK (((("revisedKey" IS NULL) AND ("revisedSize" IS NULL) AND ("revisionNotices" IS NULL) AND ((status)::text <> 'completed'::text)) OR (("revisedKey" IS NOT NULL) AND (("revisedKey")::text <> ("originalKey")::text) AND ("revisedSize" IS NOT NULL) AND ("revisedSize" > 0) AND ("revisedSize" <= 10000000) AND ((status)::text = ANY ((ARRAY['processing'::character varying, 'completed'::character varying])::text[])) AND ((phase)::text = 'rewrite'::text)))),
      ADD CONSTRAINT "CHK_document_revision_notices" CHECK ((("revisionNotices" IS NULL) OR (("revisedKey" IS NOT NULL) AND (jsonb_typeof("revisionNotices") = 'object'::text)))),
      ADD CONSTRAINT "CHK_document_stage" CHECK ((("processingStage" IS NULL) OR (((status)::text = 'processing'::text) AND ((((phase)::text = 'assessment'::text) AND (("processingStage")::text = 'assessing'::text)) OR (((phase)::text = 'rewrite'::text) AND (("processingStage")::text = ANY ((ARRAY['editing'::character varying, 'validating'::character varying])::text[]))))))),
      ADD CONSTRAINT document_size_check CHECK (((size > 0) AND (size <= 10000000)))`);
    await queryRunner.query(`CREATE FUNCTION release_deleted_document_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE allowance_reservation SET state = 'released' WHERE "documentId" = OLD.id AND state = 'active';
        RETURN OLD;
      END
    $$`);
    await queryRunner.query(
      `CREATE TRIGGER release_document_reservation BEFORE DELETE ON document FOR EACH ROW EXECUTE FUNCTION release_deleted_document_reservation()`
    );
    await queryRunner.query(`INSERT INTO role (name) VALUES ('user'), ('admin')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER release_document_reservation ON document`);
    await queryRunner.query(`DROP FUNCTION release_deleted_document_reservation`);
    await queryRunner.query(`DROP TABLE allowance_reservation`);
    await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_86033897c009fcca8b6505d6be2"`);
    await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_472b25323af01488f1f66a06b67"`);
    await queryRunner.query(`ALTER TABLE "document" DROP CONSTRAINT "FK_2d617266bd4cbb6ebcfdb5f67e2"`);
    await queryRunner.query(`ALTER TABLE "status_change" DROP CONSTRAINT "FK_status_change_admin"`);
    await queryRunner.query(`ALTER TABLE "status_change" DROP CONSTRAINT "FK_status_change_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_86033897c009fcca8b6505d6be"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_472b25323af01488f1f66a06b6"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_document_owner_history"`);
    await queryRunner.query(`DROP TABLE "document"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_status_change_user_history"`);
    await queryRunner.query(`DROP TABLE "status_change"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_status"`);
    await queryRunner.query(`DROP TABLE "role"`);
  }
}
