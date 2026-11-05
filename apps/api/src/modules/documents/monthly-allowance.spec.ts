import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'node:stream';
import { DocumentStorage } from './document-storage';
import { DocumentProvider } from './document-workflow';
import { AssessmentWorker } from '../processing/assessment-worker';
import { faithfulRevisionProvider } from '@api/shared/testing/revision-fixtures';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DocumentAssessment1793880300000 } from '../database/migrations/1793880300000-DocumentAssessment';
import { DocumentRevision1793880400000 } from '../database/migrations/1793880400000-DocumentRevision';
import { ProviderRetries1793880500000 } from '../database/migrations/1793880500000-ProviderRetries';
import { MonthlyAllowance1793880600000 } from '../database/migrations/1793880600000-MonthlyAllowance';
import { MonthlyAllowance } from './monthly-allowance';
import { UploadDocumentHandler } from './commands/upload-document.handler';
import { Document } from './entities/document.entity';
import { docxFixture } from '@api/shared/testing/docx-fixture';
import { DocumentJobs } from '../processing/document-jobs';
import { RetryDocumentHandler } from './commands/retry-document.handler';
import { DataSource } from 'typeorm';
import { FindDocumentHandler } from './queries/find-document.handler';

async function allowanceHarness(database: PGlite, allowance: MonthlyAllowance) {
  const files = new Map<string, Buffer>();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  const repository = {
    create: (data) => Object.assign(new Document(), { createdAt: new Date() }, data),
    findOne: async ({ where }) =>
      (await query('SELECT * FROM document WHERE id = $1 AND "ownerId" = $2', [where.id, where.ownerId]))[0] ?? null,
    manager: {
      transaction: (work) =>
        database.transaction(async (transaction) =>
          work({
            query: async (sql, values) => (await transaction.query(sql, values)).rows,
            getRepository: () => ({
              save: async (document) => {
                await transaction.query(
                  `INSERT INTO document (id, "ownerId", "originalKey", size, status)
            VALUES ($1, $2, $3, $4, 'queued')`,
                  [document.id, document.ownerId, document.originalKey, document.size]
                );
                return document;
              }
            })
          })
        )
    }
  };
  const storage = {
    write: async (key, bytes) => {
      files.set(key, bytes);
    },
    remove: async (key) => {
      files.delete(key);
    }
  };
  const module = await Test.createTestingModule({
    providers: [
      UploadDocumentHandler,
      RetryDocumentHandler,
      FindDocumentHandler,
      { provide: DataSource, useValue: repository.manager },
      { provide: getRepositoryToken(Document), useValue: repository },
      { provide: DocumentStorage, useValue: storage },
      { provide: MonthlyAllowance, useValue: allowance }
    ]
  }).compile();
  return {
    query,
    files,
    storage,
    upload: module.get(UploadDocumentHandler),
    retry: module.get(RetryDocumentHandler),
    find: module.get(FindDocumentHandler),
    jobs: new DocumentJobs({ query })
  };
}

describe('Monthly allowance at upload and worker boundaries', () => {
  const database = new PGlite();
  let now = new Date('2026-11-05T12:00:00Z');
  const allowance = new MonthlyAllowance({ now: () => now });
  let harness: Awaited<ReturnType<typeof allowanceHarness>>;
  const owner = randomUUID();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  beforeAll(async () => {
    harness = await allowanceHarness(database, allowance);
    await database.exec(`CREATE TABLE "user" (id uuid PRIMARY KEY, status varchar NOT NULL DEFAULT 'FREE');
      CREATE TABLE document (id uuid PRIMARY KEY, "ownerId" uuid NOT NULL REFERENCES "user"(id), "originalKey" text, size integer, "createdAt" timestamptz DEFAULT now());`);
    await new DocumentAssessment1793880300000().up({ query });
    await new DocumentRevision1793880400000().up({ query });
    await new ProviderRetries1793880500000().up({ query });
    await new MonthlyAllowance1793880600000().up({ query });
  });
  beforeEach(async () => {
    await database.exec('TRUNCATE document, allowance_reservation, "user" CASCADE');
    await query('INSERT INTO "user" (id) VALUES ($1)', [owner]);
    now = new Date('2026-11-05T12:00:00Z');
    harness.files.clear();
  });
  afterAll(() => database.close());
  const upload = async () => harness.upload.execute({ ownerId: owner, file: file(await docxFixture()) });
  const workerFor = (provider: DocumentProvider) =>
    new AssessmentWorker(
      harness.jobs,
      {
        ...harness.storage,
        read: async (key) => harness.files.get(key)
      },
      provider,
      'rules',
      { processingTimeoutMs: 900000, providerTimeoutMs: 60000 }
    );

  it('requeues a failed document using its stored original and a new allowance reservation', async () => {
    const document = await upload();
    const original = await harness.jobs.claim(900000);
    await harness.jobs.fail(original, 'provider');
    const files = new Map(harness.files);
    expect(await harness.retry.execute({ ownerId: owner, id: document.id })).toMatchObject({
      id: document.id,
      status: 'queued',
      failure: null,
      processingStage: null
    });
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1, remaining: 2 });
    const retried = await harness.jobs.claim(900000);
    expect(retried).toMatchObject({ id: document.id, originalKey: original.originalKey, size: original.size });
    expect(retried.processingAttemptId).not.toBe(original.processingAttemptId);
    expect(harness.files).toEqual(files);
    expect(await harness.jobs.claim(900000)).toBeNull();
  });

  it('clears the previous attempt before queueing and fences out its late results', async () => {
    const document = await upload();
    const old = await harness.jobs.claim(900000);
    const request = await harness.jobs.startRequest(old, 'assess:v1', 'old-input');
    await harness.jobs.finishRequest(old, 'assess:v1', { ...request, state: 'retry' }, 1000);
    await harness.jobs.fail(old, 'provider');
    await harness.retry.execute({ ownerId: owner, id: document.id });
    const [queued] = await query('SELECT * FROM document WHERE id = $1', [document.id]);
    expect(queued).toMatchObject({
      status: 'queued',
      processingAttemptId: null,
      providerRequests: {},
      nextRequestAt: null,
      processingStartedAt: null,
      processingDeadline: null,
      leaseExpiresAt: null,
      claimToken: null,
      assessment: null,
      revisedKey: null,
      revisedSize: null,
      processingStage: null,
      failureCode: null
    });
    const fresh = await harness.jobs.claim(900000);
    expect(await harness.jobs.startRequest(fresh, 'assess:v1', 'new-input')).toMatchObject({ attempts: 1 });
    expect(await harness.jobs.fail(old, 'provider')).toBe(false);
    expect(await harness.jobs.complete(old, { patterns: [] }, { key: 'stale.docx', size: 42 })).toBe(false);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
  });

  it('fails twice with full automatic retry budgets, then charges exactly once in the user retry month', async () => {
    now = new Date('2027-01-31T23:59:59.999Z');
    const document = await upload();
    const provider = faithfulRevisionProvider();
    const assess = provider.assess;
    let calls = 0;
    provider.assess = async (...args) => {
      if (++calls < 9) throw Object.assign(new Error('Temporary provider failure'), { status: 503 });
      return assess(...args);
    };
    const worker = workerFor(provider);
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let call = 0; call < 3; call++) {
        await query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [document.id]);
        expect(await worker.runOnce()).toBe(true);
      }
      expect(calls).toBe((attempt + 1) * 3);
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: attempt === 2 ? 1 : 0, reserved: 0 });
      expect(await harness.find.execute({ ownerId: owner, id: document.id })).toMatchObject({
        status: attempt === 2 ? 'completed' : 'failed'
      });
      if (attempt < 2) {
        now = new Date('2027-02-01T00:00:00Z');
        await harness.retry.execute({ ownerId: owner, id: document.id });
      }
    }
    expect(await worker.runOnce()).toBe(false);
    expect(await allowance.read({ query }, owner)).toMatchObject({ month: '2027-02', used: 1, reserved: 0 });
    now = new Date('2027-01-31T23:59:59.999Z');
    expect(await allowance.read({ query }, owner)).toMatchObject({ month: '2027-01', used: 0, reserved: 0 });
    expect(harness.files.size).toBe(2);
  });

  it('leaves an exhausted owner document failed without dispatching provider work', async () => {
    const document = await upload();
    await harness.jobs.fail(await harness.jobs.claim(900000), 'provider');
    for (let index = 0; index < 3; index++) {
      await upload();
      await harness.jobs.complete(
        await harness.jobs.claim(900000),
        { patterns: [] },
        { key: `result-${index}.docx`, size: 42 }
      );
    }
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/FREE allowance of 3.*2026-12-01.*UTC/)
    });
    expect(await harness.find.execute({ ownerId: owner, id: document.id })).toMatchObject({ status: 'failed' });
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 3, reserved: 0 });
    const provider = faithfulRevisionProvider();
    provider.assess = vi.fn(provider.assess);
    const worker = workerFor(provider);
    expect(await worker.runOnce()).toBe(false);
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it('accepts one concurrent retry and rejects non-failed work without a second reservation', async () => {
    const document = await upload();
    await harness.jobs.fail(await harness.jobs.claim(900000), 'provider');
    const results = await Promise.allSettled([
      harness.retry.execute({ ownerId: owner, id: document.id }),
      harness.retry.execute({ ownerId: owner, id: document.id })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
    const claim = await harness.jobs.claim(900000);
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({ status: 409 });
    await harness.jobs.complete(claim, { patterns: [] }, { key: 'completed.docx', size: 42 });
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({ status: 409 });
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 0 });
    expect(await harness.jobs.claim(900000)).toBeNull();
  });

  it('does not reserve or queue a failed document for a different owner', async () => {
    const document = await upload();
    await harness.jobs.fail(await harness.jobs.claim(900000), 'provider');
    const other = randomUUID();
    await query('INSERT INTO "user" (id) VALUES ($1)', [other]);
    await expect(harness.retry.execute({ ownerId: other, id: document.id })).rejects.toMatchObject({
      status: 404,
      message: 'Document not found.'
    });
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 0 });
    expect(await allowance.read({ query }, other)).toMatchObject({ used: 0, reserved: 0 });
    expect(await harness.find.execute({ ownerId: owner, id: document.id })).toMatchObject({ status: 'failed' });
    expect(await harness.jobs.claim(900000)).toBeNull();
  });

  it('rolls the retry reservation back if queueing cannot commit', async () => {
    const document = await upload();
    await harness.jobs.fail(await harness.jobs.claim(900000), 'provider');
    await query(`CREATE FUNCTION reject_fixture_retry() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture queue write failed'; END $$`);
    await query(`CREATE TRIGGER reject_fixture_retry BEFORE UPDATE ON document
      FOR EACH ROW WHEN (NEW.status = 'queued') EXECUTE FUNCTION reject_fixture_retry()`);
    try {
      await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({ status: 503 });
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 0 });
      expect(await harness.find.execute({ ownerId: owner, id: document.id })).toMatchObject({ status: 'failed' });
      expect(await harness.jobs.claim(900000)).toBeNull();
    } finally {
      await query('DROP TRIGGER reject_fixture_retry ON document');
      await query('DROP FUNCTION reject_fixture_retry()');
    }
    expect(await harness.retry.execute({ ownerId: owner, id: document.id })).toMatchObject({ status: 'queued' });
  });

  it('reserves each valid upload and rejects the fourth FREE document without saving a file or runnable job', async () => {
    for (let index = 0; index < 3; index++) await upload();
    await expect(upload()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('2026-12-01') });
    expect(await allowance.read({ query }, owner)).toEqual({
      status: 'FREE',
      limit: 3,
      used: 0,
      reserved: 3,
      remaining: 0,
      month: '2026-11',
      resetsAt: '2026-12-01T00:00:00.000Z'
    });
    expect(harness.files.size).toBe(3);
    for (let index = 0; index < 3; index++) expect(await harness.jobs.claim(900000)).not.toBeNull();
    expect(await harness.jobs.claim(900000)).toBeNull();
  });
  it('does not dispatch an unreserved job to the provider', async () => {
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status)
      VALUES ($1, $2, 'unreserved.docx', 42, 'queued')`,
      [randomUUID(), owner]
    );
    const provider = faithfulRevisionProvider();
    provider.assess = vi.fn(provider.assess);
    const worker = new AssessmentWorker(
      harness.jobs,
      {
        read: async () => docxFixture(),
        write: async () => {},
        remove: async () => {}
      },
      provider,
      'rules',
      { processingTimeoutMs: 900000, providerTimeoutMs: 60000 }
    );
    expect(await worker.runOnce()).toBe(false);
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it('charges a validated completion once and retains usage after the document is deleted', async () => {
    const document = await upload();
    const claim = await harness.jobs.claim(900000);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
    expect(await harness.jobs.complete(claim, { patterns: [] }, { key: 'revised.docx', size: 42 })).toBe(true);
    expect(await harness.jobs.complete(claim, { patterns: [] }, { key: 'other.docx', size: 42 })).toBe(false);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 0, remaining: 2 });
    await query('DELETE FROM document WHERE id = $1', [document.id]);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 0, remaining: 2 });
  });

  it.each(['failure', 'recovery', 'deletion'])(
    'releases the slot once after %s so another upload can start',
    async (ending) => {
      for (let index = 0; index < 3; index++) await upload();
      const claim = await harness.jobs.claim(900000);
      if (ending === 'failure') {
        expect(await harness.jobs.fail(claim, 'provider')).toBe(true);
        expect(await harness.jobs.fail(claim, 'provider')).toBe(false);
      } else if (ending === 'recovery') {
        await query(`UPDATE document SET "processingDeadline" = now() - interval '1 second' WHERE id = $1`, [claim.id]);
        expect(await harness.jobs.recover()).toBe(1);
        expect(await harness.jobs.recover()).toBe(0);
      } else {
        await query('DELETE FROM document WHERE id = $1', [claim.id]);
      }
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 2, remaining: 1 });
      await upload();
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 3, remaining: 0 });
    }
  );

  it.each([
    ['2026-11-30T23:59:59.999Z', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z']
  ])('keeps the reservation month across midnight at %s', async (last, first, reset) => {
    now = new Date(last);
    for (let index = 0; index < 3; index++) await upload();
    const claim = await harness.jobs.claim(900000);
    expect(await allowance.read({ query }, owner)).toMatchObject({ reserved: 3, remaining: 0, resetsAt: first });
    now = new Date(first);
    expect(await allowance.read({ query }, owner)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 3,
      resetsAt: reset
    });
    await upload();
    expect(await harness.jobs.complete(claim, { patterns: [] }, { key: 'next-month.docx', size: 42 })).toBe(true);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1, remaining: 2 });
    now = new Date(last);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 2, remaining: 0 });
  });

  it.each([
    ['PREMIUM', 15],
    ['GOLD', 35]
  ])(
    'applies %s immediately without resetting usage and honors reservations after downgrade',
    async (status, limit) => {
      for (let index = 0; index < 3; index++) await upload();
      await expect(upload()).rejects.toMatchObject({ status: 409 });
      await query('UPDATE "user" SET status = $2 WHERE id = $1', [owner, status]);
      expect(await allowance.read({ query }, owner)).toMatchObject({ limit, used: 0, reserved: 3 });
      for (let index = 3; index < Number(limit); index++) await upload();
      await expect(upload()).rejects.toMatchObject({ status: 409 });
      await query(`UPDATE "user" SET status = 'FREE' WHERE id = $1`, [owner]);
      await expect(upload()).rejects.toMatchObject({ status: 409 });
      const claim = await harness.jobs.claim(900000);
      expect(await harness.jobs.complete(claim, { patterns: [] }, { key: 'downgraded.docx', size: 42 })).toBe(true);
      expect(await allowance.read({ query }, owner)).toMatchObject({
        limit: 3,
        used: 1,
        reserved: Number(limit) - 1,
        remaining: 0
      });
    }
  );

  it('validates uploads before reserving and rolls a storage failure back', async () => {
    await expect(harness.upload.execute({ ownerId: owner, file: file(Buffer.from('invalid')) })).rejects.toMatchObject({
      status: 400
    });
    expect(await allowance.read({ query }, owner)).toMatchObject({ reserved: 0, remaining: 3 });
    expect(await harness.jobs.claim(900000)).toBeNull();
    vi.spyOn(harness.storage, 'write').mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(upload()).rejects.toMatchObject({ status: 503 });
    expect(await allowance.read({ query }, owner)).toMatchObject({ reserved: 0, remaining: 3 });
    expect(await harness.jobs.claim(900000)).toBeNull();
  });

  it('keeps the same reservation through a provider retry and charges only after validated revision publication', async () => {
    const uploaded = await upload();
    const provider = faithfulRevisionProvider();
    const assess = provider.assess;
    let calls = 0;
    provider.assess = async (...args) => {
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
      if (++calls === 1) throw Object.assign(new Error('Temporary provider failure'), { status: 503 });
      return assess(...args);
    };
    const edit = provider.edit;
    provider.edit = async (...args) => {
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
      return edit(...args);
    };
    const worker = workerFor(provider);
    await worker.runOnce();
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
    await query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [uploaded.id]);
    await worker.runOnce();
    expect(calls).toBe(2);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 0 });
  });

  it('releases the reservation when the fake provider returns an invalid revision', async () => {
    await upload();
    const provider = faithfulRevisionProvider();
    provider.edit = async () => ({ edits: [] });
    await workerFor(provider).runOnce();
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    expect(harness.files.size).toBe(1);
  });

  it('upgrades legacy queued and processing work without dispatching it or inventing historical charges', async () => {
    await new MonthlyAllowance1793880600000().down({ query });
    const completed = randomUUID();
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status, assessment, "revisedKey", "revisedSize")
      VALUES ($1, $2, 'legacy-original.docx', 42, 'completed', '{"patterns":[]}', 'legacy-revised.docx', 42)`,
      [completed, owner]
    );
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status)
      VALUES ($1, $2, 'legacy-queued.docx', 42, 'queued')`,
      [randomUUID(), owner]
    );
    await query(
      `INSERT INTO document (id, "ownerId", "originalKey", size, status, "claimToken", "processingDeadline", "leaseExpiresAt")
      VALUES ($1, $2, 'legacy-active.docx', 42, 'processing', $3, now() + interval '10 minutes', now() + interval '30 seconds')`,
      [randomUUID(), owner, randomUUID()]
    );
    await new MonthlyAllowance1793880600000().up({ query });
    expect(await harness.jobs.claim(900000)).toBeNull();
    expect(await harness.jobs.isPublished(completed, 'legacy-revised.docx')).toBe(true);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    await upload();
    await new MonthlyAllowance1793880600000().down({ query });
    await new MonthlyAllowance1793880600000().up({ query });
    expect(await harness.jobs.claim(900000)).toBeNull();
    expect(await harness.jobs.isPublished(completed, 'legacy-revised.docx')).toBe(true);
  });
  it('rolls publication back if the database cannot persist its charge', async () => {
    await upload();
    const claim = await harness.jobs.claim(900000);
    await query(`CREATE FUNCTION reject_fixture_charge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture accounting write failed'; END $$`);
    await query(`CREATE TRIGGER reject_fixture_charge BEFORE UPDATE ON allowance_reservation
      FOR EACH ROW WHEN (NEW.state = 'charged') EXECUTE FUNCTION reject_fixture_charge()`);
    try {
      await expect(harness.jobs.complete(claim, { patterns: [] }, { key: 'atomic.docx', size: 42 })).rejects.toThrow(
        'Fixture accounting write failed'
      );
      expect(await harness.jobs.isPublished(claim.id, 'atomic.docx')).toBe(false);
      expect(await allowance.read({ query }, owner)).toMatchObject({ used: 0, reserved: 1 });
    } finally {
      await query('DROP TRIGGER reject_fixture_charge ON allowance_reservation');
      await query('DROP FUNCTION reject_fixture_charge()');
    }
    expect(await harness.jobs.complete(claim, { patterns: [] }, { key: 'atomic.docx', size: 42 })).toBe(true);
    expect(await allowance.read({ query }, owner)).toMatchObject({ used: 1, reserved: 0 });
  });
});

function file(buffer: Buffer): Express.Multer.File {
  return {
    buffer,
    originalname: 'fixture.docx',
    fieldname: 'file',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    stream: Readable.from(buffer),
    destination: '',
    filename: '',
    path: ''
  };
}
