import { createDocumentTestSchema } from '@api/shared/testing/document-database';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DocumentStorage } from '../document-storage';
import { MonthlyAllowance } from '../monthly-allowance';
import { assessmentRubric } from '../assessment-workflow';
import { DeleteDocument, DeleteDocumentHandler } from './delete-document.handler';
import { AssessmentWorker } from '../../processing/assessment-worker';
import { DocumentJobs } from '../../processing/document-jobs';
import { assessmentDocxFixture } from '@api/shared/testing/assessment-fixtures';
import { faithfulRevisionProvider } from '@api/shared/testing/revision-fixtures';
import { DocumentProvider } from '../document-workflow';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';
import { planDocxEdits } from '../revise-docx';
import { readDocx } from '../validate-docx';
import { UnslopifyDocument, UnslopifyDocumentHandler } from './unslopify-document.handler';
import { RetryDocument, RetryDocumentHandler } from './retry-document.handler';

const assessment = { rubric: assessmentRubric, score: 40, patterns: [] };
const preview = { blocks: [] };
const notices = { keptPassages: [], uneditedElements: [] };

describe('Delete a stored document', () => {
  const database = new PGlite();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  const files = new Map<string, Buffer>();
  const failing = new Set<string>();
  const storage = {
    read: async (key: string) => {
      const bytes = files.get(key);
      if (!bytes) throw new Error('Missing private document');
      return bytes;
    },
    write: async (key: string, bytes: Buffer) => {
      files.set(key, Buffer.from(bytes));
    },
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
    await createDocumentTestSchema(database);
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
  ])('deletes a %s %s document, releasing its rewrite reservation once', async (status, phase) => {
    const document = await stored('queued', phase);
    if (status === 'processing')
      await query(
        `UPDATE document SET status = 'processing', "claimToken" = $2, "processingDeadline" = now() + interval '1 hour',
          "leaseExpiresAt" = now() + interval '30 seconds', "processingStage" = $3 WHERE id = $1`,
        [document.id, randomUUID(), phase === 'assessment' ? 'assessing' : 'editing']
      );
    if (phase === 'rewrite')
      await query(
        `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
        VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
        [randomUUID(), owner, document.id]
      );
    await remove(document.id);
    await expect(remove(document.id)).rejects.toMatchObject({ status: 404 });
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await query('SELECT state FROM allowance_reservation')).toEqual(
      phase === 'rewrite' ? [{ state: 'released' }] : []
    );
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
  });

  it('removes the intermediate revision saved before a final assessment and releases the slot', async () => {
    const document = await stored('queued', 'rewrite');
    const revisedKey = `${randomUUID()}.docx`;
    files.set(revisedKey, Buffer.from('revised'));
    await query(
      `UPDATE document SET status = 'processing', "claimToken" = $2, "processingDeadline" = now() + interval '1 hour',
        "leaseExpiresAt" = now() + interval '30 seconds', "processingStage" = 'final-assessment',
        "revisedKey" = $3, "revisedSize" = 7, "revisionNotices" = $4::jsonb WHERE id = $1`,
      [document.id, randomUUID(), revisedKey, JSON.stringify(notices)]
    );
    await query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
      [randomUUID(), owner, document.id]
    );
    await remove(document.id);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await query('SELECT state FROM allowance_reservation')).toEqual([{ state: 'released' }]);
  });
});

describe('Delete an active document', () => {
  const database = new PGlite();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  const files = new Map<string, Buffer>();
  const storage = {
    read: async (key: string) => {
      const bytes = files.get(key);
      if (!bytes) throw new Error('Missing private document');
      return bytes;
    },
    write: async (key: string, bytes: Buffer) => {
      files.set(key, Buffer.from(bytes));
    },
    remove: async (key: string) => {
      files.delete(key);
    }
  };
  const allowance = new MonthlyAllowance({ now: () => new Date() });
  const jobs = new DocumentJobs({ query });
  const timeouts = { assessmentTimeoutMs: 300000, processingTimeoutMs: 900000, providerTimeoutMs: 60000 };
  const owner = randomUUID();
  let handler: DeleteDocumentHandler;
  let unslopify: UnslopifyDocumentHandler;
  let retry: RetryDocumentHandler;
  let original: Buffer;

  beforeAll(async () => {
    original = await assessmentDocxFixture();
    await createDocumentTestSchema(database);
    const module = await Test.createTestingModule({
      providers: [
        DeleteDocumentHandler,
        UnslopifyDocumentHandler,
        RetryDocumentHandler,
        { provide: MonthlyAllowance, useValue: allowance },
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
    unslopify = module.get(UnslopifyDocumentHandler);
    retry = module.get(RetryDocumentHandler);
  });
  beforeEach(async () => {
    await database.exec('TRUNCATE document, allowance_reservation, "user" CASCADE');
    await query('INSERT INTO "user" (id) VALUES ($1)', [owner]);
    files.clear();
  });
  afterAll(() => database.close());

  async function queuedAssessment(bytes = original) {
    const id = randomUUID();
    files.set(`${id}.docx`, bytes);
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status, phase) VALUES ($1, $2, $3, $4, 'queued', 'assessment')`,
      [id, owner, `${id}.docx`, bytes.length]
    );
    return id;
  }
  async function queuedRewrite(bytes = original) {
    const id = await queuedAssessment(bytes);
    await query(
      `UPDATE document SET phase = 'rewrite', strength = 50, assessment = $2::jsonb, preview = $3::jsonb WHERE id = $1`,
      [id, JSON.stringify(assessment), JSON.stringify(preview)]
    );
    await query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
      [randomUUID(), owner, id]
    );
    return id;
  }
  const worker = (provider: DocumentProvider) => new AssessmentWorker(jobs, storage, provider, 'rules', timeouts);
  const remove = (id: string) => handler.execute(new DeleteDocument(owner, id));
  const rows = () => query('SELECT id FROM document');
  const reservations = () => query('SELECT state FROM allowance_reservation') as Promise<{ state: string }[]>;
  const usage = async () => {
    const { used, reserved } = await allowance.read({ query }, owner);
    return { used, reserved };
  };

  it('discards an initial assessment that returns after the document was deleted', async () => {
    const id = await queuedAssessment();
    const provider = faithfulRevisionProvider();
    provider.assess = vi.fn(async () => {
      await remove(id);
      return { score: 20, patterns: [] };
    });
    expect(await worker(provider).runOnce()).toBe(true);
    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await reservations()).toEqual([]);
    expect(await usage()).toEqual({ used: 0, reserved: 0 });
    expect(await worker(provider).runOnce()).toBe(false);
    expect(provider.assess).toHaveBeenCalledTimes(1);
  });
  it.each(['assessment', 'rewrite'] as const)(
    'sends no further request for a %s document deleted during an automatic-retry wait',
    async (phase) => {
      const id = phase === 'assessment' ? await queuedAssessment() : await queuedRewrite();
      const provider = faithfulRevisionProvider();
      const temporary = vi.fn(async () => {
        throw Object.assign(new Error('Service unavailable'), { status: 503 });
      });
      if (phase === 'assessment') provider.assess = temporary;
      else provider.edit = temporary;
      expect(await worker(provider).runOnce()).toBe(true);
      expect(await query('SELECT status, "nextRequestAt" IS NOT NULL AS waiting FROM document')).toEqual([
        { status: 'processing', waiting: true }
      ]);
      await remove(id);
      await query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second'`);
      expect(await worker(provider).runOnce()).toBe(false);
      expect(temporary).toHaveBeenCalledTimes(1);
      expect(await rows()).toEqual([]);
      expect(files.size).toBe(0);
      expect(await reservations()).toEqual(phase === 'rewrite' ? [{ state: 'released' }] : []);
      expect(await usage()).toEqual({ used: 0, reserved: 0 });
    }
  );

  it('stops editing the remaining chunks once the document is deleted', async () => {
    const bytes = await readerFixture(textParagraph('In order to proceed, word '.repeat(600)));
    expect(planDocxEdits(await readDocx(bytes)).length).toBeGreaterThan(1);
    const id = await queuedRewrite(bytes);
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    provider.edit = vi.fn(async (system, chunk, signal) => {
      await remove(id);
      return edit(system, chunk, signal);
    });
    expect(await worker(provider).runOnce()).toBe(true);
    expect(provider.edit).toHaveBeenCalledTimes(1);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await reservations()).toEqual([{ state: 'released' }]);
    expect(await usage()).toEqual({ used: 0, reserved: 0 });
  });

  it.each(['scored', 'unavailable'] as const)(
    'leaves nothing behind and charges nothing when deletion commits before publication (%s final score)',
    async (outcome) => {
      const id = await queuedRewrite();
      const provider = faithfulRevisionProvider();
      provider.assess = vi.fn(async () => {
        await remove(id);
        if (outcome === 'unavailable') throw Object.assign(new Error('Bad request'), { status: 400 });
        return { score: 10, patterns: [] };
      });
      expect(await worker(provider).runOnce()).toBe(true);
      expect(provider.assess).toHaveBeenCalledTimes(1);
      expect(await rows()).toEqual([]);
      expect(files.size).toBe(0);
      expect(await reservations()).toEqual([{ state: 'released' }]);
      expect(await usage()).toEqual({ used: 0, reserved: 0 });
      expect(await worker(provider).runOnce()).toBe(false);
    }
  );

  it('keeps the charge and removes the files when completion commits before deletion', async () => {
    const id = await queuedRewrite();
    expect(await worker(faithfulRevisionProvider()).runOnce()).toBe(true);
    expect(await query('SELECT status FROM document')).toEqual([{ status: 'completed' }]);
    expect(files.size).toBe(2);
    await remove(id);
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await reservations()).toEqual([{ state: 'charged' }]);
    expect(await usage()).toEqual({ used: 1, reserved: 0 });
  });

  it.each(['assessment', 'rewrite'] as const)(
    'does nothing for a deleted %s document recovered after a worker restart',
    async (phase) => {
      const id = phase === 'assessment' ? await queuedAssessment() : await queuedRewrite();
      const claim = await jobs.claim(timeouts);
      expect(claim?.id).toBe(id);
      expect(await jobs.startRequest(claim, 'assess:v2', 'hash')).toMatchObject({ state: 'running' });
      await query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second'`);
      await remove(id);
      const provider = faithfulRevisionProvider();
      provider.assess = vi.fn(provider.assess);
      provider.edit = vi.fn(provider.edit);
      expect(await worker(provider).runOnce()).toBe(false);
      expect(provider.assess).not.toHaveBeenCalled();
      expect(provider.edit).not.toHaveBeenCalled();
      expect(await rows()).toEqual([]);
      expect(files.size).toBe(0);
      expect(await reservations()).toEqual(phase === 'rewrite' ? [{ state: 'released' }] : []);
    }
  );

  it('cannot be recreated or reserved by Unslopify after deletion, and releases once when Unslopify came first', async () => {
    const first = await queuedAssessment();
    expect(await worker(faithfulRevisionProvider()).runOnce()).toBe(true);
    await remove(first);
    await expect(unslopify.execute(new UnslopifyDocument(owner, first))).rejects.toMatchObject({ status: 404 });
    expect(await rows()).toEqual([]);
    expect(await reservations()).toEqual([]);
    const second = await queuedAssessment();
    expect(await worker(faithfulRevisionProvider()).runOnce()).toBe(true);
    await unslopify.execute(new UnslopifyDocument(owner, second));
    await remove(second);
    await expect(remove(second)).rejects.toMatchObject({ status: 404 });
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect(await reservations()).toEqual([{ state: 'released' }]);
    expect(await usage()).toEqual({ used: 0, reserved: 0 });
  });

  it('releases the retry reservation once and leaves no job when a retried rewrite is deleted', async () => {
    const id = await queuedRewrite();
    const provider = faithfulRevisionProvider();
    provider.edit = async () => {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    };
    expect(await worker(provider).runOnce()).toBe(true);
    expect(await query('SELECT status FROM document')).toEqual([{ status: 'failed' }]);
    await retry.execute(new RetryDocument(owner, id));
    expect(await usage()).toEqual({ used: 0, reserved: 1 });
    await remove(id);
    expect(await jobs.claim(timeouts)).toBeNull();
    expect(await rows()).toEqual([]);
    expect(files.size).toBe(0);
    expect((await reservations()).map((row) => row.state).sort()).toEqual(['released', 'released']);
    expect(await usage()).toEqual({ used: 0, reserved: 0 });
  });
});
