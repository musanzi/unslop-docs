process.env.TS_NODE_PROJECT = 'apps/api/tsconfig.json';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { DataSource } = require('typeorm');
const { Document } = require('../apps/api/src/modules/documents/entities/document.entity');
const { User, StatusChange } = require('../apps/api/src/modules/users/entities');
const { Role } = require('../apps/api/src/modules/roles/entities');
const { MonthlyAllowance } = require('../apps/api/src/modules/documents/monthly-allowance');
const { UploadDocumentHandler } = require('../apps/api/src/modules/documents/commands/upload-document.handler');
const { RetryDocumentHandler } = require('../apps/api/src/modules/documents/commands/retry-document.handler');
const { UnslopifyDocumentHandler } = require('../apps/api/src/modules/documents/commands/unslopify-document.handler');
const { DocumentJobs } = require('../apps/api/src/modules/processing/document-jobs');
const { AssessmentWorker } = require('../apps/api/src/modules/processing/assessment-worker');
const { assessmentDocxFixture } = require('../apps/api/src/shared/testing/assessment-fixtures');
const { faithfulRevisionProvider } = require('../apps/api/src/shared/testing/revision-fixtures');
const { UpdateStatusHandler } = require('../apps/api/src/modules/users/commands/handlers/update-status.handler');

const connection = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  logging: false
};
const timeouts = { assessmentTimeoutMs: 300000, processingTimeoutMs: 900000, providerTimeoutMs: 60000 };
const noNotices = { keptPassages: [], uneditedElements: [] };

async function main() {
  const admin = await new DataSource({ ...connection, database: process.env.DB_NAME }).initialize();
  const name = `unslopy_allowance_${randomUUID().replaceAll('-', '')}`;
  let database;
  let blocker;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    database = await new DataSource({
      ...connection,
      database: name,
      entities: [Document, User, StatusChange, Role],
      migrations: [resolve('apps/api/src/modules/database/migrations/*.ts')]
    }).initialize();
    await database.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await database.runMigrations();
    let now = new Date('2026-12-31T23:59:59.999Z');
    const allowance = new MonthlyAllowance({ now: () => now });
    const files = new Map();
    const storage = {
      read: async (key) => files.get(key),
      write: async (key, bytes) => {
        files.set(key, bytes);
      },
      remove: async (key) => {
        files.delete(key);
      }
    };
    const upload = new UploadDocumentHandler(database.getRepository(Document), storage);
    const unslopifyHandler = new UnslopifyDocumentHandler(database, allowance);
    const retry = new RetryDocumentHandler(database, allowance);
    const jobs = new DocumentJobs(database);
    const bytes = await assessmentDocxFixture();
    const add = (ownerId) => upload.execute({ ownerId, file: { buffer: bytes, originalname: 'fixture.docx' } });
    const unslopify = (ownerId, id, strength = 50) => unslopifyHandler.execute({ ownerId, id, strength });
    const worker = (provider = faithfulRevisionProvider()) =>
      new AssessmentWorker(jobs, storage, provider, 'fixture rules', timeouts);
    const assessed = async (ownerId, count) => {
      const documents = [];
      for (let index = 0; index < count; index++) documents.push(await add(ownerId));
      for (let index = 0; index < count; index++) assert.equal(await worker().runOnce(), true);
      return documents;
    };
    const createOwner = async () => {
      const id = randomUUID();
      await database.query('INSERT INTO "user" (id, email, name) VALUES ($1, $2, $3)', [
        id,
        `${id}@example.invalid`,
        'Allowance fixture'
      ]);
      return id;
    };
    const waitForLock = async (count) => {
      const until = Date.now() + 10000;
      while (Date.now() < until) {
        const [row] = await admin.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = $1 AND wait_event_type = 'Lock'`,
          [name]
        );
        if (row.waiting >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Competing test transactions did not reach the database lock');
    };
    const holdOwner = async (owner) => {
      blocker = database.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [owner]);
    };
    const releaseOwner = async () => {
      await blocker.commitTransaction();
      await blocker.release();
      blocker = null;
    };
    for (let round = 0; round < 10; round++) {
      const owner = await createOwner();
      const documents = await assessed(owner, 4);
      assert.deepEqual(await allowance.read(database, owner), {
        status: 'FREE',
        limit: 3,
        used: 0,
        reserved: 0,
        remaining: 3,
        month: '2026-12',
        resetsAt: '2027-01-01T00:00:00.000Z'
      });
      await unslopify(owner, documents[0].id);
      await unslopify(owner, documents[1].id);
      const before = files.size;
      await holdOwner(owner);
      const competing = Promise.allSettled([unslopify(owner, documents[2].id), unslopify(owner, documents[3].id)]);
      await waitForLock(2);
      await releaseOwner();
      const results = await competing;
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getStatus(), 409);
      assert.equal(files.size, before);
      assert.deepEqual(await allowance.read(database, owner), {
        status: 'FREE',
        limit: 3,
        used: 0,
        reserved: 3,
        remaining: 0,
        month: '2026-12',
        resetsAt: '2027-01-01T00:00:00.000Z'
      });
    }
    console.log(
      'PASS PostgreSQL last-slot race: 10 rounds, two blocked Unslopify requests per round, exactly one accepted'
    );

    const boundaryOwner = await createOwner();
    const [boundary] = await assessed(boundaryOwner, 1);
    await holdOwner(boundaryOwner);
    const crossing = unslopify(boundaryOwner, boundary.id);
    await waitForLock(1);
    now = new Date('2027-01-01T00:00:00.000Z');
    await releaseOwner();
    await crossing;
    assert.equal((await allowance.read(database, boundaryOwner)).reserved, 1);
    now = new Date('2026-12-31T23:59:59.999Z');
    assert.equal((await allowance.read(database, boundaryOwner)).reserved, 0);
    console.log('PASS reservation clock is read after the owner lock across December/January');

    await database.query('DELETE FROM document');
    const owner = await createOwner();
    const [document] = await assessed(owner, 1);
    await unslopify(owner, document.id, 80);
    const provider = faithfulRevisionProvider();
    let calls = 0;
    const assess = provider.assess;
    provider.assess = async (...args) => {
      calls++;
      return assess(...args);
    };
    now = new Date('2027-01-01T00:00:00.000Z');
    await worker(provider).runOnce();
    assert.equal(calls, 1);
    assert.equal((await allowance.read(database, owner)).used, 0);
    now = new Date('2026-12-31T23:59:59.999Z');
    assert.equal((await allowance.read(database, owner)).used, 1);
    assert.equal((await allowance.read(database, owner)).reserved, 0);
    const [completed] = await database.query(
      'SELECT status, strength, "finalAssessment" IS NOT NULL AS scored FROM document WHERE id = $1',
      [document.id]
    );
    assert.deepEqual(completed, { status: 'completed', strength: 80, scored: true });
    await database.query('DELETE FROM document WHERE id = $1', [document.id]);
    assert.equal((await allowance.read(database, owner)).used, 1);
    const [charge] = await database.query(
      'SELECT "documentId", state FROM allowance_reservation WHERE "ownerId" = $1',
      [owner]
    );
    assert.deepEqual(charge, { documentId: null, state: 'charged' });
    console.log(
      'PASS fake provider produces a validated DOCX with a final score, charges the reservation month, and deletion retains the charge'
    );

    const unreserved = randomUUID();
    await database.query(
      `INSERT INTO document (id, "ownerId", filename, "originalKey", size, status, phase, strength, assessment)
      VALUES ($1, $2, 'fixture.docx', $3, $4, 'queued', 'rewrite', 50, '{"rubric":"ai-style-v1","score":40,"patterns":[]}')`,
      [unreserved, owner, `${unreserved}.docx`, bytes.length]
    );
    assert.equal(await worker(provider).runOnce(), false);
    assert.equal(calls, 1);
    await database.query('DELETE FROM document WHERE id = $1', [unreserved]);
    console.log('PASS an unreserved rewrite cannot call the provider');

    const adminId = await createOwner();
    const adminUser = { id: adminId, email: `${adminId}@example.invalid`, isAdmin: true };
    const statuses = new UpdateStatusHandler(database.getRepository(User));
    const [first, second, third, fourth] = await assessed(owner, 4);
    await unslopify(owner, first.id);
    await unslopify(owner, second.id);
    await assert.rejects(unslopify(owner, third.id), (error) => error.getStatus() === 409);
    await statuses.execute({ userId: owner, status: 'PREMIUM', admin: adminUser });
    await unslopify(owner, third.id);
    await statuses.execute({ userId: owner, status: 'FREE', admin: adminUser });
    await assert.rejects(unslopify(owner, fourth.id), (error) => error.getStatus() === 409);
    const claim = await jobs.claim(timeouts);
    assert.equal(await jobs.saveRevision(claim, { key: `${randomUUID()}.docx`, size: 42 }, noNotices), true);
    assert.equal(await jobs.complete(claim, null), true);
    assert.equal(await jobs.complete(claim, null), false);
    assert.equal((await allowance.read(database, owner)).used, 2);
    const failing = await jobs.claim(timeouts);
    assert.equal(await jobs.fail(failing, 'provider'), true);
    assert.equal(await jobs.fail(failing, 'provider'), false);
    assert.equal((await allowance.read(database, owner)).reserved, 1);
    console.log(
      'PASS actual admin status changes preserve usage; downgrade permits completion; terminal accounting is idempotent'
    );

    const duplicateOwner = await createOwner();
    const duplicate = await assessed(duplicateOwner, 1);
    await unslopify(duplicateOwner, duplicate[0].id);
    await assert.rejects(
      database.query(
        `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      SELECT $1, "ownerId", "documentId", "reservedAt", month, 'active' FROM allowance_reservation WHERE "documentId" = $2`,
        [randomUUID(), duplicate[0].id]
      ),
      (error) => error.code === '23505'
    );
    console.log('PASS database uniqueness rejects a second active reservation');

    await database.query('DELETE FROM document');
    for (let round = 0; round < 10; round++) {
      const retryOwner = await createOwner();
      const [failed] = await assessed(retryOwner, 1);
      await unslopify(retryOwner, failed.id, 70);
      await jobs.fail(await jobs.claim(timeouts), 'provider');
      const before = files.size;
      await holdOwner(retryOwner);
      const competing = Promise.allSettled([
        retry.execute({ ownerId: retryOwner, id: failed.id }),
        retry.execute({ ownerId: retryOwner, id: failed.id })
      ]);
      await waitForLock(2);
      await releaseOwner();
      const results = await competing;
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getStatus(), 409);
      assert.equal(files.size, before);
      assert.equal((await allowance.read(database, retryOwner)).reserved, 1);
      const claim = await jobs.claim(timeouts);
      assert.equal(claim.id, failed.id);
      assert.equal(claim.strength, 70);
      assert.equal(await jobs.claim(timeouts), null);
      await jobs.fail(claim, 'provider');
      assert.equal((await allowance.read(database, retryOwner)).reserved, 0);
      assert.equal((await allowance.read(database, retryOwner)).used, 0);
    }
    console.log(
      'PASS PostgreSQL concurrent rewrite retries: 10 rounds, one queued job and reservation, no new original or charge'
    );

    now = new Date('2027-01-31T23:59:59.999Z');
    const retryOwner = await createOwner();
    const [failed] = await assessed(retryOwner, 1);
    await unslopify(retryOwner, failed.id);
    await jobs.fail(await jobs.claim(timeouts), 'provider');
    await holdOwner(retryOwner);
    const retryCrossing = retry.execute({ ownerId: retryOwner, id: failed.id });
    await waitForLock(1);
    now = new Date('2027-02-01T00:00:00.000Z');
    await releaseOwner();
    await retryCrossing;
    assert.equal((await allowance.read(database, retryOwner)).reserved, 1);
    await worker().runOnce();
    assert.equal((await allowance.read(database, retryOwner)).used, 1);
    assert.equal((await allowance.read(database, retryOwner)).reserved, 0);
    now = new Date('2027-01-31T23:59:59.999Z');
    assert.equal((await allowance.read(database, retryOwner)).used, 0);
    assert.equal((await allowance.read(database, retryOwner)).reserved, 0);
    console.log('PASS retry waiting across January/February charges February after fake-provider completion');
  } finally {
    if (blocker) {
      await blocker.rollbackTransaction();
      await blocker.release();
    }
    if (database?.isInitialized) await database.destroy();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.destroy();
    console.log('Disposable allowance database removed');
  }
}
main().catch(() => {
  console.error('PostgreSQL allowance verification failed; no credentials or document contents logged.');
  process.exitCode = 1;
});
