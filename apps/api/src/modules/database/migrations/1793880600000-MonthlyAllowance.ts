import { MigrationInterface } from 'typeorm';

export class MonthlyAllowance1793880600000 implements MigrationInterface {
  async up(database: { query(sql: string): Promise<unknown> }): Promise<void> {
    await database.query(`CREATE TABLE allowance_reservation (
      id uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      "documentId" uuid REFERENCES document(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
      "reservedAt" timestamptz NOT NULL,
      month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
      state varchar NOT NULL CHECK (state IN ('active', 'charged', 'released')),
      CHECK (state <> 'active' OR "documentId" IS NOT NULL)
    )`);
    await database.query(`CREATE UNIQUE INDEX "IDX_allowance_active_document"
      ON allowance_reservation ("documentId") WHERE state = 'active'`);
    await database.query(`CREATE INDEX "IDX_allowance_owner_month"
      ON allowance_reservation ("ownerId", month) WHERE state IN ('active', 'charged')`);
    await database.query(`CREATE FUNCTION release_deleted_document_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE allowance_reservation SET state = 'released' WHERE "documentId" = OLD.id AND state = 'active';
        RETURN OLD;
      END
    $$`);
    await database.query(`CREATE TRIGGER release_document_reservation BEFORE DELETE ON document
      FOR EACH ROW EXECUTE FUNCTION release_deleted_document_reservation()`);
    await database.query(`UPDATE document SET status = 'failed', "failureCode" = 'interrupted',
      "claimToken" = NULL, "leaseExpiresAt" = NULL, "processingStage" = NULL, "nextRequestAt" = NULL,
      "providerRequests" = '{}'::jsonb WHERE status IN ('queued', 'processing')`);
  }

  async down(database: { query(sql: string): Promise<unknown> }): Promise<void> {
    await database.query(`UPDATE document SET status = 'failed', "failureCode" = 'interrupted',
      "claimToken" = NULL, "leaseExpiresAt" = NULL, "processingStage" = NULL, "nextRequestAt" = NULL,
      "providerRequests" = '{}'::jsonb WHERE status IN ('queued', 'processing')`);
    await database.query('DROP TRIGGER release_document_reservation ON document');
    await database.query('DROP FUNCTION release_deleted_document_reservation()');
    await database.query('DROP TABLE allowance_reservation');
  }
}
