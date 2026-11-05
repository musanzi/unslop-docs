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
import { RevisionNotices1793880800000 } from '../database/migrations/1793880800000-RevisionNotices';
import { AssessThenUnslopify1793880900000 } from '../database/migrations/1793880900000-AssessThenUnslopify';
import { MonthlyAllowance } from './monthly-allowance';
import { UploadDocumentHandler } from './commands/upload-document.handler';
import { Document } from './entities/document.entity';
import { assessmentDocxFixture } from '@api/shared/testing/assessment-fixtures';
import { DocumentJobs } from '../processing/document-jobs';
import { RetryDocumentHandler } from './commands/retry-document.handler';
import { UnslopifyDocument, UnslopifyDocumentHandler } from './commands/unslopify-document.handler';
import { DataSource } from 'typeorm';
import { FindDocumentHandler } from './queries/find-document.handler';
import { assessmentRubric } from './assessment-workflow';

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
    read: async (key) => files.get(key),
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
      UnslopifyDocumentHandler,
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
    unslopify: module.get(UnslopifyDocumentHandler),
    find: module.get(FindDocumentHandler),
    jobs: new DocumentJobs({ query })
  };
}

const noNotices = { keptPassages: [], uneditedElements: [] };
const timeouts = { processingTimeoutMs: 900000, providerTimeoutMs: 60000 };

describe('Monthly allowance at Unslopify and worker boundaries', () => {
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
    await new RevisionNotices1793880800000().up({ query });
    await new AssessThenUnslopify1793880900000().up({ query });
  });
  beforeEach(async () => {
    await database.exec('TRUNCATE document, allowance_reservation, "user" CASCADE');
    await query('INSERT INTO "user" (id) VALUES ($1)', [owner]);
    now = new Date('2026-11-05T12:00:00Z');
    harness.files.clear();
  });
  afterAll(() => database.close());
  const workerFor = (provider: DocumentProvider = faithfulRevisionProvider()) =>
    new AssessmentWorker(harness.jobs, harness.storage, provider, 'rules', timeouts);
  const upload = async () => harness.upload.execute({ ownerId: owner, file: file(await assessmentDocxFixture()) });
  const assessed = async () => (await assessedDocuments(1))[0];
  const assessedDocuments = async (count: number) => {
    const documents: Awaited<ReturnType<typeof upload>>[] = [];
    for (let index = 0; index < count; index++) documents.push(await upload());
    for (let index = 0; index < count; index++) expect(await workerFor().runOnce()).toBe(true);
    return documents;
  };
  const unslopify = (id: string, strength?: number, ownerId = owner) =>
    harness.unslopify.execute({ ownerId, id, strength: strength ?? 50 });
  const detail = (id: string) => harness.find.execute({ ownerId: owner, id });
  const read = () => allowance.read({ query }, owner);
  const row = async (id: string) => (await query('SELECT * FROM document WHERE id = $1', [id]))[0] as Document;

  it('queues only the initial assessment at upload and holds no slot while the preview waits', async () => {
    const document = await upload();
    expect(document).toMatchObject({ status: 'queued', phase: 'assessment', strength: null, progress: null });
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    expect(await workerFor(provider).runOnce()).toBe(true);
    expect(provider.edit).not.toHaveBeenCalled();
    expect(await detail(document.id)).toMatchObject({
      status: 'assessed',
      phase: 'assessment',
      assessment: { rubric: assessmentRubric, score: 20, patterns: [] },
      finalAssessment: null
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    expect(await harness.jobs.claim(timeouts)).toBeNull();
    expect(harness.files.size).toBe(1);
  });

  it('reserves one slot when Unslopify queues rewriting and leaves an out-of-allowance preview untouched', async () => {
    const documents = await assessedDocuments(4);
    for (const [index, document] of documents.slice(0, 3).entries()) {
      expect(await unslopify(document.id, 10 + index)).toMatchObject({
        id: document.id,
        status: 'queued',
        phase: 'rewrite',
        strength: 10 + index
      });
    }
    expect(await read()).toMatchObject({ used: 0, reserved: 3, remaining: 0 });
    await expect(unslopify(documents[3].id)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/FREE allowance of 3.*2026-12-01.*UTC/)
    });
    expect(await detail(documents[3].id)).toMatchObject({
      status: 'assessed',
      strength: null,
      assessment: { score: 20 }
    });
    for (let index = 0; index < 3; index++) expect((await harness.jobs.claim(timeouts))?.phase).toBe('rewrite');
    expect(await harness.jobs.claim(timeouts)).toBeNull();
    expect(harness.files.size).toBe(4);
  });

  it('defaults the rewrite strength to 50 and rejects values outside 1 to 100 without reserving', async () => {
    const document = await assessed();
    for (const strength of [0, 101, 50.5, Number.NaN])
      await expect(unslopify(document.id, strength)).rejects.toMatchObject({ status: 400 });
    expect(await read()).toMatchObject({ reserved: 0 });
    expect(await harness.unslopify.execute(new UnslopifyDocument(owner, document.id))).toMatchObject({ strength: 50 });
    expect(await read()).toMatchObject({ reserved: 1 });
  });

  it('accepts one of two concurrent Unslopify clicks and refuses later clicks without a second reservation', async () => {
    const document = await assessed();
    const results = await Promise.allSettled([unslopify(document.id, 60), unslopify(document.id, 70)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409, message: 'Rewriting is already queued for this document.' }
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 1 });
    const claim = await harness.jobs.claim(timeouts);
    await expect(unslopify(document.id)).rejects.toMatchObject({ status: 409 });
    await harness.jobs.saveRevision(claim, { key: 'completed.docx', size: 42 }, noNotices);
    await harness.jobs.complete(claim, null);
    await expect(unslopify(document.id)).rejects.toMatchObject({
      status: 409,
      message: 'This document already has a revised version.'
    });
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
    expect(await harness.jobs.claim(timeouts)).toBeNull();
  });

  it('refuses Unslopify for queued, processing and failed assessments and for other owners', async () => {
    const document = await upload();
    await expect(unslopify(document.id)).rejects.toMatchObject({
      status: 409,
      message: 'Only assessed documents can be rewritten.'
    });
    const claim = await harness.jobs.claim(timeouts);
    await expect(unslopify(document.id)).rejects.toMatchObject({ status: 409 });
    await harness.jobs.fail(claim, 'provider');
    await expect(unslopify(document.id)).rejects.toMatchObject({
      status: 409,
      message: 'Only assessed documents can be rewritten.'
    });
    const waiting = await assessed();
    const other = randomUUID();
    await query('INSERT INTO "user" (id) VALUES ($1)', [other]);
    await expect(unslopify(waiting.id, 50, other)).rejects.toMatchObject({
      status: 404,
      message: 'Document not found.'
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 0 });
    expect(await allowance.read({ query }, other)).toMatchObject({ used: 0, reserved: 0 });
    expect(await detail(waiting.id)).toMatchObject({ status: 'assessed' });
  });

  it('accepts exactly one of two Unslopify requests racing for the last slot', async () => {
    const [first, second, ...queued] = await assessedDocuments(4);
    for (const document of queued) await unslopify(document.id);
    const results = await Promise.allSettled([unslopify(first.id), unslopify(second.id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await read()).toMatchObject({ used: 0, reserved: 3, remaining: 0 });
    const statuses = await Promise.all([detail(first.id), detail(second.id)]);
    expect(statuses.map((item) => item.status).sort()).toEqual(['assessed', 'queued']);
  });

  it('charges the reservation month once when the revised download is ready', async () => {
    now = new Date('2027-01-31T23:59:59.999Z');
    const document = await assessed();
    await unslopify(document.id);
    expect(await read()).toMatchObject({ month: '2027-01', used: 0, reserved: 1 });
    now = new Date('2027-02-01T00:00:00Z');
    expect(await read()).toMatchObject({ month: '2027-02', used: 0, reserved: 0, remaining: 3 });
    expect(await workerFor().runOnce()).toBe(true);
    expect(await detail(document.id)).toMatchObject({
      status: 'completed',
      assessment: { score: 20 },
      finalAssessment: { score: 20 },
      finalScoreUnavailable: false
    });
    expect(await read()).toMatchObject({ month: '2027-02', used: 0, reserved: 0 });
    now = new Date('2027-01-31T23:59:59.999Z');
    expect(await read()).toMatchObject({ month: '2027-01', used: 1, reserved: 0, remaining: 2 });
    expect(harness.files.size).toBe(2);
    await query('DELETE FROM document WHERE id = $1', [document.id]);
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
  });

  it('retries a failed initial assessment without reserving a slot', async () => {
    const document = await upload();
    const provider = faithfulRevisionProvider();
    provider.assess = async () => {
      throw Object.assign(new Error('private'), { status: 400 });
    };
    await workerFor(provider).runOnce();
    expect(await detail(document.id)).toMatchObject({ status: 'failed', phase: 'assessment', assessment: null });
    expect(await harness.retry.execute({ ownerId: owner, id: document.id })).toMatchObject({
      status: 'queued',
      phase: 'assessment',
      failure: null
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    expect(await workerFor().runOnce()).toBe(true);
    expect(await detail(document.id)).toMatchObject({ status: 'assessed', assessment: { score: 20 } });
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
  });

  it('retries a failed rewrite with its assessment and strength and a new reservation', async () => {
    const [document, ...others] = await assessedDocuments(4);
    await unslopify(document.id, 70);
    const provider = faithfulRevisionProvider();
    provider.edit = async () => ({ edits: [] });
    await workerFor(provider).runOnce();
    expect(await detail(document.id)).toMatchObject({
      status: 'failed',
      phase: 'rewrite',
      strength: 70,
      assessment: { score: 20 },
      failure: expect.stringContaining('original is still available')
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    const old = await row(document.id);
    expect(await harness.retry.execute({ ownerId: owner, id: document.id })).toMatchObject({
      status: 'queued',
      phase: 'rewrite',
      strength: 70,
      failure: null
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 1, remaining: 2 });
    expect(await row(document.id)).toMatchObject({
      assessment: old.assessment,
      preview: old.preview,
      strength: 70,
      processingAttemptId: null,
      providerRequests: {},
      failureCode: null
    });
    const claim = await harness.jobs.claim(timeouts);
    expect(claim).toMatchObject({ phase: 'rewrite', strength: 70 });
    expect(await harness.jobs.fail(claim, 'provider')).toBe(true);
    for (const other of others) await unslopify(other.id);
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/FREE allowance of 3/)
    });
    expect(await detail(document.id)).toMatchObject({ status: 'failed', strength: 70, assessment: { score: 20 } });
    expect(await read()).toMatchObject({ used: 0, reserved: 3, remaining: 0 });
  });

  it('accepts one concurrent retry of a failed rewrite and rejects non-failed work without a second reservation', async () => {
    const document = await assessed();
    await unslopify(document.id);
    await harness.jobs.fail(await harness.jobs.claim(timeouts), 'provider');
    const results = await Promise.allSettled([
      harness.retry.execute({ ownerId: owner, id: document.id }),
      harness.retry.execute({ ownerId: owner, id: document.id })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await read()).toMatchObject({ used: 0, reserved: 1 });
    await harness.jobs.claim(timeouts);
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({ status: 409 });
    expect(await read()).toMatchObject({ used: 0, reserved: 1 });
  });

  it('does not reserve or queue a failed document for a different owner', async () => {
    const document = await assessed();
    await unslopify(document.id);
    await harness.jobs.fail(await harness.jobs.claim(timeouts), 'provider');
    const other = randomUUID();
    await query('INSERT INTO "user" (id) VALUES ($1)', [other]);
    await expect(harness.retry.execute({ ownerId: other, id: document.id })).rejects.toMatchObject({
      status: 404,
      message: 'Document not found.'
    });
    expect(await read()).toMatchObject({ used: 0, reserved: 0 });
    expect(await allowance.read({ query }, other)).toMatchObject({ used: 0, reserved: 0 });
    expect(await detail(document.id)).toMatchObject({ status: 'failed' });
    expect(await harness.jobs.claim(timeouts)).toBeNull();
  });

  it.each(['unslopify', 'retry'] as const)(
    'rolls the %s reservation back if queueing cannot commit',
    async (action) => {
      const document = await assessed();
      if (action === 'retry') {
        await unslopify(document.id);
        await harness.jobs.fail(await harness.jobs.claim(timeouts), 'provider');
      }
      await query(`CREATE FUNCTION reject_fixture_queue() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture queue write failed'; END $$`);
      await query(`CREATE TRIGGER reject_fixture_queue BEFORE UPDATE ON document
      FOR EACH ROW WHEN (NEW.status = 'queued') EXECUTE FUNCTION reject_fixture_queue()`);
      const act = () =>
        action === 'retry' ? harness.retry.execute({ ownerId: owner, id: document.id }) : unslopify(document.id);
      try {
        await expect(act()).rejects.toMatchObject({ status: 503 });
        expect(await read()).toMatchObject({ used: 0, reserved: 0 });
        expect(await detail(document.id)).toMatchObject({ status: action === 'retry' ? 'failed' : 'assessed' });
        expect(await harness.jobs.claim(timeouts)).toBeNull();
      } finally {
        await query('DROP TRIGGER reject_fixture_queue ON document');
        await query('DROP FUNCTION reject_fixture_queue()');
      }
      expect(await act()).toMatchObject({ status: 'queued', phase: 'rewrite' });
      expect(await read()).toMatchObject({ used: 0, reserved: 1 });
    }
  );

  it.each(['failure', 'recovery', 'deletion'])(
    'releases the rewrite slot once after %s so another rewrite can start',
    async (ending) => {
      const [waiting, ...queued] = await assessedDocuments(4);
      for (const document of queued) await unslopify(document.id);
      const claim = await harness.jobs.claim(timeouts);
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
      expect(await read()).toMatchObject({ used: 0, reserved: 2, remaining: 1 });
      await unslopify(waiting.id);
      expect(await read()).toMatchObject({ used: 0, reserved: 3, remaining: 0 });
    }
  );

  it.each([
    ['2026-11-30T23:59:59.999Z', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z']
  ])('keeps the reservation month across midnight at %s', async (last, first, reset) => {
    now = new Date(last);
    const [waiting, ...queued] = await assessedDocuments(4);
    for (const document of queued) await unslopify(document.id);
    const claim = await harness.jobs.claim(timeouts);
    expect(await read()).toMatchObject({ reserved: 3, remaining: 0, resetsAt: first });
    now = new Date(first);
    expect(await read()).toMatchObject({ used: 0, reserved: 0, remaining: 3, resetsAt: reset });
    await unslopify(waiting.id);
    await harness.jobs.saveRevision(claim, { key: 'next-month.docx', size: 42 }, noNotices);
    expect(await harness.jobs.complete(claim, null)).toBe(true);
    expect(await read()).toMatchObject({ used: 0, reserved: 1, remaining: 2 });
    now = new Date(last);
    expect(await read()).toMatchObject({ used: 1, reserved: 2, remaining: 0 });
  });

  it.each([
    ['PREMIUM', 15],
    ['GOLD', 35]
  ])(
    'applies %s immediately without resetting usage and honors reservations after downgrade',
    async (status, limit) => {
      const documents = await assessedDocuments(Number(limit) + 1);
      const queue = () => unslopify(documents.shift().id);
      for (let index = 0; index < 3; index++) await queue();
      await expect(unslopify(documents[0].id)).rejects.toMatchObject({ status: 409 });
      await query('UPDATE "user" SET status = $2 WHERE id = $1', [owner, status]);
      expect(await read()).toMatchObject({ limit, used: 0, reserved: 3 });
      for (let index = 3; index < Number(limit); index++) await queue();
      await expect(unslopify(documents[0].id)).rejects.toMatchObject({ status: 409 });
      await query(`UPDATE "user" SET status = 'FREE' WHERE id = $1`, [owner]);
      await expect(unslopify(documents[0].id)).rejects.toMatchObject({ status: 409 });
      const claim = await harness.jobs.claim(timeouts);
      await harness.jobs.saveRevision(claim, { key: 'downgraded.docx', size: 42 }, noNotices);
      expect(await harness.jobs.complete(claim, null)).toBe(true);
      expect(await read()).toMatchObject({ limit: 3, used: 1, reserved: Number(limit) - 1, remaining: 0 });
    }
  );

  it('validates uploads before saving and rolls a storage failure back without any reservation', async () => {
    await expect(harness.upload.execute({ ownerId: owner, file: file(Buffer.from('invalid')) })).rejects.toMatchObject({
      status: 400
    });
    expect(await harness.jobs.claim(timeouts)).toBeNull();
    vi.spyOn(harness.storage, 'write').mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(upload()).rejects.toMatchObject({ status: 503 });
    expect(await read()).toMatchObject({ reserved: 0, remaining: 3 });
    expect(await harness.jobs.claim(timeouts)).toBeNull();
  });

  it('keeps the same reservation through provider retries and charges only after the revision is published', async () => {
    const document = await assessed();
    await unslopify(document.id);
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    let calls = 0;
    provider.edit = async (...args) => {
      expect(await read()).toMatchObject({ used: 0, reserved: 1 });
      if (++calls === 1) throw Object.assign(new Error('Temporary provider failure'), { status: 503 });
      return edit(...args);
    };
    const assess = provider.assess;
    provider.assess = async (...args) => {
      expect(await read()).toMatchObject({ used: 0, reserved: 1 });
      return assess(...args);
    };
    const worker = workerFor(provider);
    await worker.runOnce();
    expect(await read()).toMatchObject({ used: 0, reserved: 1 });
    await query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [document.id]);
    await worker.runOnce();
    expect(calls).toBe(2);
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
  });

  it('charges once when the final assessment fails and the revision is published without a score', async () => {
    const document = await assessed();
    await unslopify(document.id);
    const provider = faithfulRevisionProvider();
    provider.assess = async () => {
      throw Object.assign(new Error('private'), { status: 400 });
    };
    await workerFor(provider).runOnce();
    expect(await detail(document.id)).toMatchObject({
      status: 'completed',
      assessment: { score: 20 },
      finalAssessment: null,
      finalScoreUnavailable: true
    });
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
    await expect(harness.retry.execute({ ownerId: owner, id: document.id })).rejects.toMatchObject({ status: 409 });
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
  });

  it('rolls publication back if the database cannot persist its charge', async () => {
    await unslopify((await assessed()).id);
    const claim = await harness.jobs.claim(timeouts);
    await harness.jobs.saveRevision(claim, { key: 'atomic.docx', size: 42 }, noNotices);
    await query(`CREATE FUNCTION reject_fixture_charge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture accounting write failed'; END $$`);
    await query(`CREATE TRIGGER reject_fixture_charge BEFORE UPDATE ON allowance_reservation
      FOR EACH ROW WHEN (NEW.state = 'charged') EXECUTE FUNCTION reject_fixture_charge()`);
    try {
      await expect(harness.jobs.complete(claim, null)).rejects.toThrow('Fixture accounting write failed');
      expect(await harness.jobs.isPublished(claim.id, 'atomic.docx')).toBe(false);
      expect(await read()).toMatchObject({ used: 0, reserved: 1 });
    } finally {
      await query('DROP TRIGGER reject_fixture_charge ON allowance_reservation');
      await query('DROP FUNCTION reject_fixture_charge()');
    }
    expect(await harness.jobs.complete(claim, null)).toBe(true);
    expect(await read()).toMatchObject({ used: 1, reserved: 0 });
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
