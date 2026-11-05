import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'node:stream';
import { DocumentStorage } from './document-storage';
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

async function allowanceHarness(database: PGlite, allowance: MonthlyAllowance) {
  const files = new Map<string, Buffer>();
  const query = async (sql: string, values?: unknown[]) => (await database.query(sql, values)).rows;
  const repository = {
    create: (data) => Object.assign(new Document(), { createdAt: new Date() }, data),
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
      { provide: getRepositoryToken(Document), useValue: repository },
      { provide: DocumentStorage, useValue: storage },
      { provide: MonthlyAllowance, useValue: allowance }
    ]
  }).compile();
  return { query, files, storage, upload: module.get(UploadDocumentHandler), jobs: new DocumentJobs({ query }) };
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
    const worker = new AssessmentWorker(
      harness.jobs,
      {
        ...harness.storage,
        read: async (key) => harness.files.get(key)
      },
      provider,
      'rules',
      { processingTimeoutMs: 900000, providerTimeoutMs: 60000 }
    );
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
    await new AssessmentWorker(
      harness.jobs,
      {
        ...harness.storage,
        read: async (key) => harness.files.get(key)
      },
      provider,
      'rules',
      { processingTimeoutMs: 900000, providerTimeoutMs: 60000 }
    ).runOnce();
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
