import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocumentTestSchema } from '@api/shared/testing/document-database';

describe('Initial schema', () => {
  const database = new PGlite();
  const owner = randomUUID();
  beforeAll(async () => {
    await createDocumentTestSchema(database);
    await database.query('INSERT INTO "user" (id) VALUES ($1)', [owner]);
  });
  afterAll(() => database.close());

  it('creates the roles that sign-in and admin access depend on', async () => {
    expect((await database.query('SELECT name FROM role ORDER BY name')).rows).toEqual([
      { name: 'admin' },
      { name: 'user' }
    ]);
  });

  it('releases an active reservation when its document is deleted', async () => {
    const id = randomUUID();
    await database.query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status, phase, strength, assessment)
      VALUES ($1, $2, $3, 42, 'queued', 'rewrite', 50, '{}'::jsonb)`,
      [id, owner, `${id}.docx`]
    );
    await database.query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
      [randomUUID(), owner, id]
    );
    await database.query('DELETE FROM document WHERE id = $1', [id]);
    expect((await database.query('SELECT state, "documentId" FROM allowance_reservation')).rows).toEqual([
      { state: 'released', documentId: null }
    ]);
  });

  it('rejects a processing stage outside the document lifecycle', async () => {
    const id = randomUUID();
    await expect(
      database.query(
        `INSERT INTO document (id, "originalKey", size, status, "claimToken", "processingStage", "processingDeadline", "leaseExpiresAt")
        VALUES ($1, $2, 42, 'processing', $1, 'final-assessment', now(), now())`,
        [id, `${id}.docx`]
      )
    ).rejects.toThrow();
  });
});
