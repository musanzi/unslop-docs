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
    const upload = new UploadDocumentHandler(database.getRepository(Document), storage, allowance);
    const bytes = await assessmentDocxFixture();
    const add = (ownerId) => upload.execute({ ownerId, file: { buffer: bytes, originalname: 'fixture.docx' } });
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
      await add(owner);
      await add(owner);
      const before = files.size;
      await holdOwner(owner);
      const competing = Promise.allSettled([add(owner), add(owner)]);
      await waitForLock(2);
      await releaseOwner();
      const results = await competing;
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getStatus(), 409);
      assert.equal(files.size, before + 1);
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
      'PASS PostgreSQL last-slot race: 10 rounds, two blocked connections per round, exactly one accepted upload'
    );

    const boundaryOwner = await createOwner();
    await holdOwner(boundaryOwner);
    const crossing = add(boundaryOwner);
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
    const document = await add(owner);
    const jobs = new DocumentJobs(database);
    const provider = faithfulRevisionProvider();
    let calls = 0;
    const assess = provider.assess;
    provider.assess = async (...args) => {
      calls++;
      return assess(...args);
    };
    const worker = new AssessmentWorker(jobs, storage, provider, 'fixture rules', {
      processingTimeoutMs: 900000,
      providerTimeoutMs: 60000
    });
    now = new Date('2027-01-01T00:00:00.000Z');
    await worker.runOnce();
    assert.equal(calls, 1);
    assert.equal((await allowance.read(database, owner)).used, 0);
    now = new Date('2026-12-31T23:59:59.999Z');
    assert.equal((await allowance.read(database, owner)).used, 1);
    assert.equal((await allowance.read(database, owner)).reserved, 0);
    await database.query('DELETE FROM document WHERE id = $1', [document.id]);
    assert.equal((await allowance.read(database, owner)).used, 1);
    const [charge] = await database.query(
      'SELECT "documentId", state FROM allowance_reservation WHERE "ownerId" = $1',
      [owner]
    );
    assert.deepEqual(charge, { documentId: null, state: 'charged' });
    console.log(
      'PASS fake provider produces a validated DOCX, charges the reservation month, and deletion retains the charge'
    );

    const unreserved = randomUUID();
    await database.query(
      `INSERT INTO document (id, "ownerId", filename, "originalKey", size, status)
      VALUES ($1, $2, 'fixture.docx', $3, $4, 'queued')`,
      [unreserved, owner, `${unreserved}.docx`, bytes.length]
    );
    assert.equal(await worker.runOnce(), false);
    assert.equal(calls, 1);
    await database.query('DELETE FROM document WHERE id = $1', [unreserved]);
    console.log('PASS unreserved work cannot call the provider');

    const adminId = await createOwner();
    const adminUser = { id: adminId, email: `${adminId}@example.invalid`, isAdmin: true };
    const statuses = new UpdateStatusHandler(database.getRepository(User));
    await add(owner);
    await add(owner);
    await assert.rejects(add(owner), (error) => error.getStatus() === 409);
    await statuses.execute({ userId: owner, status: 'PREMIUM', admin: adminUser });
    await add(owner);
    await statuses.execute({ userId: owner, status: 'FREE', admin: adminUser });
    await assert.rejects(add(owner), (error) => error.getStatus() === 409);
    const claim = await jobs.claim(900000);
    assert.equal(await jobs.complete(claim, { patterns: [] }, { key: `${randomUUID()}.docx`, size: 42 }), true);
    assert.equal(await jobs.complete(claim, { patterns: [] }, { key: `${randomUUID()}.docx`, size: 42 }), false);
    assert.equal((await allowance.read(database, owner)).used, 2);
    const failing = await jobs.claim(900000);
    assert.equal(await jobs.fail(failing, 'provider'), true);
    assert.equal(await jobs.fail(failing, 'provider'), false);
    assert.equal((await allowance.read(database, owner)).reserved, 1);
    console.log(
      'PASS actual admin status changes preserve usage; downgrade permits completion; terminal accounting is idempotent'
    );

    const duplicate = await add(await createOwner());
    await assert.rejects(
      database.query(
        `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      SELECT $1, "ownerId", "documentId", "reservedAt", month, 'active' FROM allowance_reservation WHERE "documentId" = $2`,
        [randomUUID(), duplicate.id]
      ),
      (error) => error.code === '23505'
    );
    console.log('PASS database uniqueness rejects a second active reservation');

    await database.query('DELETE FROM document');
    const retry = new RetryDocumentHandler(database, allowance);
    for (let round = 0; round < 10; round++) {
      const retryOwner = await createOwner();
      const failed = await add(retryOwner);
      await jobs.fail(await jobs.claim(900000), 'provider');
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
      const claim = await jobs.claim(900000);
      assert.equal(claim.id, failed.id);
      assert.equal(await jobs.claim(900000), null);
      await jobs.fail(claim, 'provider');
      assert.equal((await allowance.read(database, retryOwner)).reserved, 0);
      assert.equal((await allowance.read(database, retryOwner)).used, 0);
    }
    console.log(
      'PASS PostgreSQL concurrent retries: 10 rounds, one queued job and reservation, no new original or charge'
    );

    now = new Date('2027-01-31T23:59:59.999Z');
    const retryOwner = await createOwner();
    const failed = await add(retryOwner);
    await jobs.fail(await jobs.claim(900000), 'provider');
    await holdOwner(retryOwner);
    const retryCrossing = retry.execute({ ownerId: retryOwner, id: failed.id });
    await waitForLock(1);
    now = new Date('2027-02-01T00:00:00.000Z');
    await releaseOwner();
    await retryCrossing;
    assert.equal((await allowance.read(database, retryOwner)).reserved, 1);
    await worker.runOnce();
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
