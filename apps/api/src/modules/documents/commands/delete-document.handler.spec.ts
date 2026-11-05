import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DocumentAssessment1793880300000 } from '../../database/migrations/1793880300000-DocumentAssessment';
import { DocumentRevision1793880400000 } from '../../database/migrations/1793880400000-DocumentRevision';
import { ProviderRetries1793880500000 } from '../../database/migrations/1793880500000-ProviderRetries';
import { MonthlyAllowance1793880600000 } from '../../database/migrations/1793880600000-MonthlyAllowance';
import { RevisionNotices1793880800000 } from '../../database/migrations/1793880800000-RevisionNotices';
import { AssessThenUnslopify1793880900000 } from '../../database/migrations/1793880900000-AssessThenUnslopify';
import { DocumentStorage } from '../document-storage';
import { MonthlyAllowance } from '../monthly-allowance';
import { assessmentRubric } from '../assessment-workflow';
import { DeleteDocument, DeleteDocumentHandler } from './delete-document.handler';

const assessment = { rubric: assessmentRubric, score: 40, patterns: [] };
const preview = { blocks: [] };
const notices = { keptPassages: [], uneditedElements: [] };

describe('Delete a stored document', () => {
  const database = new PGlite();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  const files = new Map<string, Buffer>();
  const failing = new Set<string>();
  const storage = {
    remove: async (key: string) => {
      if (failing.has(key)) throw new Error('Storage unavailable');
      files.delete(key);
    }
  };
  const allowance = new MonthlyAllowance({ now: () => new Date() });
  const owner = randomUUID();
  const other = randomUUID();
  let handler: DeleteDocumentHandler;

  beforeAll(async () => {
    await database.exec(`CREATE TABLE "user" (id uuid PRIMARY KEY, status varchar NOT NULL DEFAULT 'FREE');
      CREATE TABLE document (id uuid PRIMARY KEY, "ownerId" uuid NOT NULL REFERENCES "user"(id), "originalKey" text, size integer, "createdAt" timestamptz DEFAULT now());`);
    await new DocumentAssessment1793880300000().up({ query });
    await new DocumentRevision1793880400000().up({ query });
    await new ProviderRetries1793880500000().up({ query });
    await new MonthlyAllowance1793880600000().up({ query });
    await new RevisionNotices1793880800000().up({ query });
    await new AssessThenUnslopify1793880900000().up({ query });
    const module = await Test.createTestingModule({
      providers: [
        DeleteDocumentHandler,
        {
          provide: DataSource,
          useValue: {
            transaction: (work) =>
              database.transaction((transaction) =>
                work({ query: async (sql, values) => (await transaction.query(sql, values)).rows })
              )
          }
        },
        { provide: DocumentStorage, useValue: storage }
      ]
    }).compile();
    handler = module.get(DeleteDocumentHandler);
  });
  beforeEach(async () => {
    await database.exec('TRUNCATE document, allowance_reservation, "user" CASCADE');
    await query('INSERT INTO "user" (id) VALUES ($1), ($2)', [owner, other]);
    files.clear();
    failing.clear();
  });
  afterAll(() => database.close());

  async function stored(status: string, phase = 'assessment', ownerId = owner) {
    const id = randomUUID();
    const originalKey = `${id}.docx`;
    const revisedKey = status === 'completed' ? `${randomUUID()}.docx` : null;
    const assessed = ['assessed', 'completed'].includes(status) || phase === 'rewrite';
    files.set(originalKey, Buffer.from('original'));
    if (revisedKey) files.set(revisedKey, Buffer.from('revised'));
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status, phase, strength, assessment, preview,
        "providerRequests", "failureCode", "revisedKey", "revisedSize", "finalAssessment", "revisionNotices")
      VALUES ($1, $2, $3, 42, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13::jsonb, $14::jsonb)`,
      [
        id,
        ownerId,
        originalKey,
        status,
        phase,
        phase === 'rewrite' ? 50 : null,
        assessed ? JSON.stringify(assessment) : null,
        assessed ? JSON.stringify(preview) : null,
        JSON.stringify({ 'assess:v2': { inputHash: 'x', attempts: 1, state: 'succeeded', outcome: assessment } }),
        status === 'failed' ? 'provider' : null,
        revisedKey,
        revisedKey ? 7 : null,
        revisedKey ? JSON.stringify(assessment) : null,
        revisedKey ? JSON.stringify(notices) : null
      ]
    );
    return { id, originalKey, revisedKey };
  }
  async function completed() {
    const document = await stored('completed', 'rewrite');
    await query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'charged')`,
      [randomUUID(), owner, document.id]
    );
    return document;
  }
  const rows = () => query('SELECT id FROM document');
  const remove = (id: string, ownerId = owner) => handler.execute(new DeleteDocument(ownerId, id));

  it('removes a completed document with its original, revision and record while keeping the charge', async () => {
    const document = await completed();
    const untouched = await completed();
    await remove(document.id);
    expect(await rows()).toEqual([{ id: untouched.id }]);
    expect([...files.keys()].sort()).toEqual([untouched.originalKey, untouched.revisedKey].sort());
    expect(await query('SELECT state FROM allowance_reservation ORDER BY state')).toEqual([
      { state: 'charged' },
      { state: 'charged' }
    ]);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 2, reserved: 0, remaining: 1 });
  });

  it.each([
    ['stored', 'assessment'],
    ['assessed', 'assessment'],
    ['failed', 'assessment'],
    ['failed', 'rewrite']
  ])('deletes a %s %s document with its original without touching the allowance', async (status, phase) => {
    const document = await stored(status, phase);
    if (phase === 'rewrite')
      await query(
        `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
        VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'released')`,
        [randomUUID(), owner, document.id]
      );
    const before = await allowance.read({ query }, owner);
    await remove(document.id);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await query('SELECT state FROM allowance_reservation')).toEqual(
      phase === 'rewrite' ? [{ state: 'released' }] : []
    );
    expect(await allowance.read({ query }, owner)).toEqual(before);
  });

  it('refuses other owners with not found and leaves the document and its files intact', async () => {
    const document = await completed();
    await expect(remove(document.id, other)).rejects.toMatchObject({ status: 404, message: 'Document not found.' });
    await expect(remove('not-a-uuid')).rejects.toMatchObject({ status: 404, message: 'Document not found.' });
    expect(await rows()).toEqual([{ id: document.id }]);
    expect([...files.keys()].sort()).toEqual([document.originalKey, document.revisedKey].sort());
    expect(await query('SELECT state FROM allowance_reservation')).toEqual([{ state: 'charged' }]);
  });

  it('answers a repeated delete with the same not found as a document that never existed', async () => {
    const document = await completed();
    await remove(document.id);
    const repeated = remove(document.id);
    await expect(repeated).rejects.toMatchObject({ status: 404, message: 'Document not found.' });
    await expect(remove(randomUUID())).rejects.toMatchObject({ status: 404, message: 'Document not found.' });
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('keeps the record pointing at a file that could not be removed and deletes it on the next attempt', async () => {
    const document = await completed();
    failing.add(document.revisedKey);
    await expect(remove(document.id)).rejects.toMatchObject({
      status: 503,
      message: 'The document could not be deleted. Try again.'
    });
    expect(await query('SELECT id, "originalKey", "revisedKey", status FROM document')).toEqual([
      { id: document.id, originalKey: document.originalKey, revisedKey: document.revisedKey, status: 'completed' }
    ]);
    expect(files.has(document.revisedKey)).toBe(true);
    expect(await query('SELECT state FROM allowance_reservation')).toEqual([{ state: 'charged' }]);
    failing.clear();
    await remove(document.id);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
  });

  it.each([
    ['queued', 'assessment'],
    ['processing', 'assessment'],
    ['queued', 'rewrite'],
    ['processing', 'rewrite']
  ])('refuses to delete a %s %s document until active deletion lands', async (status, phase) => {
    const document = await stored('queued', phase);
    if (status === 'processing')
      await query(
        `UPDATE document SET status = 'processing', "claimToken" = $2, "processingDeadline" = now() + interval '1 hour',
          "leaseExpiresAt" = now() + interval '30 seconds' WHERE id = $1`,
        [document.id, randomUUID()]
      );
    if (phase === 'rewrite')
      await query(
        `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
        VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
        [randomUUID(), owner, document.id]
      );
    await expect(remove(document.id)).rejects.toMatchObject({
      status: 409,
      message: 'This document is still being processed. Wait until it finishes or fails before deleting it.'
    });
    expect(await rows()).toEqual([{ id: document.id }]);
    expect(files.has(document.originalKey)).toBe(true);
    expect(await query('SELECT state FROM allowance_reservation')).toEqual(
      phase === 'rewrite' ? [{ state: 'active' }] : []
    );
  });
});
