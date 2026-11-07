import { Logger } from '@nestjs/common';
import { createDocumentTestSchema } from '@api/shared/testing/document-database';
import { faithfulRevisionProvider } from '@api/shared/testing/revision-fixtures';
import { assessmentDocxFixture, assessmentFixtureText } from '@api/shared/testing/assessment-fixtures';
import { AssessmentWorker, WorkerSettings } from './assessment-worker';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DocumentJobs } from './document-jobs';
import { detectionFixture } from '@api/shared/testing/detection-fixtures';
import { ProviderFailure } from '../documents/provider-failure';

const noNotices = { keptPassages: [], uneditedElements: [] };
const initialAssessment = detectionFixture(40);
const preview = { blocks: [] };
const timeouts = { processingTimeoutMs: 900000, providerTimeoutMs: 60000 };

describe('Durable document jobs', () => {
  const database = new PGlite();
  const sql = {
    query: async (query: string, values?: unknown[]) =>
      (
        await database.query<{
          id: string;
          status: string;
          phase: string;
          strength: number;
          processingStage: string;
          processingDeadline: Date;
          claimToken: string;
          assessment: unknown;
          preview: unknown;
          revisedKey: string;
          revisedSize: number;
          revisionNotices: unknown;
          editingCompleted: number;
          editingTotal: number;
          failureCode: string;
          state: string;
        }>(query, values)
      ).rows
  };
  const jobs = new DocumentJobs(sql);
  const owner = randomUUID();
  let fixtureBytes: Buffer;
  beforeAll(async () => {
    fixtureBytes = await assessmentDocxFixture();
    await createDocumentTestSchema(database);
    await database.query('INSERT INTO "user" (id) VALUES ($1)', [owner]);
  });
  beforeEach(async () => {
    await database.exec('DELETE FROM document; DELETE FROM allowance_reservation');
  });
  afterAll(async () => {
    await database.close();
  });
  async function enqueue() {
    const id = randomUUID();
    await database.query(`INSERT INTO document (id, "originalKey", size, status) VALUES ($1, $2, 42, 'queued')`, [
      id,
      `${id}.docx`
    ]);
    return id;
  }
  async function reserve(id: string) {
    await database.query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 'active')`,
      [randomUUID(), owner, id]
    );
  }
  async function enqueueRewrite(strength = 50, reserved = true) {
    const id = randomUUID();
    await database.query(
      `INSERT INTO document (id, "originalKey", size, status, phase, strength, assessment, preview)
      VALUES ($1, $2, 42, 'queued', 'rewrite', $3, $4::jsonb, $5::jsonb)`,
      [id, `${id}.docx`, strength, JSON.stringify(initialAssessment), JSON.stringify(preview)]
    );
    if (reserved) await reserve(id);
    return id;
  }
  const reservations = async (id: string) =>
    (await sql.query('SELECT state FROM allowance_reservation WHERE "documentId" = $1', [id])).map((row) => row.state);
  const workerWith = (
    storage: ReturnType<typeof privateStorage>,
    provider: ReturnType<typeof faithfulRevisionProvider>,
    settings: WorkerSettings = timeouts
  ) => new AssessmentWorker(new DocumentJobs(sql), storage, provider, 'rules', settings);

  it('retries an incomplete editing response and reuses already completed chunks', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await readerFixture(textParagraph('In order to compare the results. '.repeat(150))));
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    const calls: string[] = [];
    provider.edit = async (system, chunk, signal) => {
      calls.push(chunk.id);
      if (calls.length === 2) throw new ProviderFailure('output');
      return edit(system, chunk, signal);
    };
    const worker = workerWith(storage, provider);
    await worker.runOnce();
    expect(await sql.query('SELECT status FROM document')).toEqual([{ status: 'processing' }]);
    await sql.query('UPDATE document SET "nextRequestAt" = now() - interval \'1 second\'');
    await worker.runOnce();
    expect(await sql.query('SELECT status FROM document')).toEqual([{ status: 'completed' }]);
    expect(calls.filter((id) => id === calls[0])).toHaveLength(1);
    expect(calls.filter((id) => id === calls[1])).toHaveLength(2);
    expect(await reservations(id)).toEqual(['charged']);
  });

  it('publishes the initial assessment and preview without a reservation, then waits for the user', async () => {
    const id = await enqueue();
    const storage = privateStorage(await assessmentDocxFixture());
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    const worker = workerWith(storage, provider, { ...timeouts, assessmentTimeoutMs: 300000 });
    expect(await worker.runOnce()).toBe(true);
    const [row] = await sql.query(
      'SELECT status, phase, assessment, preview, "claimToken", "processingStage", "processingDeadline", strength FROM document WHERE id = $1',
      [id]
    );
    expect(row).toEqual({
      status: 'assessed',
      phase: 'assessment',
      assessment: initialAssessment,
      preview: {
        blocks: [
          {
            kind: 'paragraph',
            level: null,
            text: assessmentFixtureText,
            inlines: [{ text: assessmentFixtureText, bold: false, italic: false, protected: null }],
            rows: null,
            reason: null
          }
        ]
      },
      claimToken: null,
      processingStage: null,
      processingDeadline: null,
      strength: null
    });
    expect(provider.edit).not.toHaveBeenCalled();
    expect(storage.revisions.size).toBe(0);
    expect(await reservations(id)).toEqual([]);
    expect(await worker.runOnce()).toBe(false);
  });

  it('sends the assessed prose to the detector, then rewrites only when the user asks', async () => {
    const id = await enqueue();
    const storage = privateStorage(await assessmentDocxFixture());
    const editor = faithfulRevisionProvider();
    const edit = vi.fn(editor.edit);
    const detect = vi.fn(editor.detect);
    const worker = workerWith(storage, { edit, detect });
    await worker.runOnce();
    expect(detect.mock.calls[0][0]).toBe(assessmentFixtureText);
    expect(edit).not.toHaveBeenCalled();
    const [assessed] = await sql.query('SELECT status, assessment FROM document WHERE id = $1', [id]);
    expect(assessed).toMatchObject({ status: 'assessed', assessment: { status: 'complete', rate: 40 } });
    await database.query(`UPDATE document SET status = 'queued', phase = 'rewrite', strength = 50 WHERE id = $1`, [id]);
    await reserve(id);
    await worker.runOnce();
    expect(edit.mock.calls[0][0]).toContain('PINNED SKILL');
    expect(detect).toHaveBeenCalledTimes(1);
    expect(await sql.query('SELECT status, assessment FROM document WHERE id = $1', [id])).toEqual([
      { status: 'completed', assessment: assessed.assessment }
    ]);
    expect(await reservations(id)).toEqual(['charged']);
  });

  it('uses the assessment deadline for assessment claims and the rewrite deadline for rewrite claims', async () => {
    await enqueue();
    const assessment = await jobs.claim({ assessmentTimeoutMs: 120000, processingTimeoutMs: 900000 });
    expect(assessment.phase).toBe('assessment');
    expect(assessment.processingDeadline.getTime() - assessment.processingStartedAt.getTime()).toBeCloseTo(120000, -2);
    await enqueueRewrite(70);
    const rewrite = await jobs.claim({ assessmentTimeoutMs: 120000, processingTimeoutMs: 900000 });
    expect(rewrite).toMatchObject({ phase: 'rewrite', strength: 70, revisedKey: null });
    expect(rewrite.processingDeadline.getTime() - rewrite.processingStartedAt.getTime()).toBeCloseTo(900000, -2);
    expect(await sql.query(`SELECT "processingStage" FROM document WHERE id = $1`, [rewrite.id])).toEqual([
      { processingStage: 'editing' }
    ]);
  });

  it('rates an older original before rewriting after its previous result was removed', async () => {
    const id = await enqueueRewrite();
    await database.query('UPDATE document SET assessment = NULL WHERE id = $1', [id]);
    await workerWith(privateStorage(await assessmentDocxFixture()), faithfulRevisionProvider()).runOnce();
    expect(await sql.query('SELECT status, assessment FROM document WHERE id = $1', [id])).toMatchObject([
      { status: 'completed', assessment: { status: 'complete', rate: 40 } }
    ]);
    expect(await reservations(id)).toEqual(['charged']);
  });

  it('publishes a saved revision on resume without editing again', async () => {
    const id = await enqueueRewrite();
    const claim = await jobs.claim(timeouts);
    const checkpoint = await jobs.startRequest(claim, 'edit:chunk', 'input');
    await jobs.finishRequest(claim, 'edit:chunk', { ...checkpoint, state: 'succeeded', outcome: {} });
    await jobs.saveRevision(claim, { key: 'saved-revision.docx', size: 42 }, noNotices);
    await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second' WHERE id = $1`, [id]);
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    expect(await workerWith(privateStorage(await assessmentDocxFixture()), provider).runOnce()).toBe(true);
    expect(provider.edit).not.toHaveBeenCalled();
    expect(await sql.query('SELECT status, "revisedKey" FROM document WHERE id = $1', [id])).toEqual([
      { status: 'completed', revisedKey: 'saved-revision.docx' }
    ]);
    expect(await reservations(id)).toEqual(['charged']);
  });

  it('claims a queued rewrite only while it holds an active reservation', async () => {
    const id = await enqueueRewrite(50, false);
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    const worker = workerWith(privateStorage(await assessmentDocxFixture()), provider);
    expect(await worker.runOnce()).toBe(false);
    expect(provider.edit).not.toHaveBeenCalled();
    await reserve(id);
    expect(await worker.runOnce()).toBe(true);
    expect(await sql.query('SELECT status FROM document WHERE id = $1', [id])).toEqual([{ status: 'completed' }]);
  });

  it('rewrites with the persisted strength, keeps the rate and charges the slot once', async () => {
    const id = await enqueueRewrite(80);
    const storage = privateStorage(await assessmentDocxFixture());
    const provider = faithfulRevisionProvider();
    const editSystems: string[] = [];
    const edit = provider.edit;
    provider.edit = async (system, chunk, signal) => {
      editSystems.push(system);
      return edit(system, chunk, signal);
    };
    expect(await workerWith(storage, provider).runOnce()).toBe(true);
    expect(editSystems.length).toBeGreaterThan(0);
    for (const system of editSystems) expect(system).toContain('Rewrite strength: 80 of 100');
    const [revisedKey] = storage.revisions.keys();
    const [row] = await sql.query(
      'SELECT status, phase, strength, assessment, "revisedKey", "revisedSize", "revisionNotices", "processingStage", "claimToken", "editingCompleted", "editingTotal" FROM document WHERE id = $1',
      [id]
    );
    expect(row).toEqual({
      status: 'completed',
      phase: 'rewrite',
      strength: 80,
      assessment: initialAssessment,
      revisedKey,
      revisedSize: storage.revisions.get(revisedKey).length,
      revisionNotices: noNotices,
      processingStage: null,
      claimToken: null,
      editingCompleted: null,
      editingTotal: null
    });
    expect(await reservations(id)).toEqual(['charged']);
    expect(await workerWith(storage, provider).runOnce()).toBe(false);
  });

  it('reports completed and total editing work while chunks are edited and clears it afterwards', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await readerFixture(textParagraph('word '.repeat(2000))));
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    const progress: { completed: number; total: number; stage: string }[] = [];
    provider.edit = async (system, chunk, signal) => {
      const [row] = await sql.query(
        'SELECT "editingCompleted", "editingTotal", "processingStage" FROM document WHERE id = $1',
        [id]
      );
      progress.push({ completed: row.editingCompleted, total: row.editingTotal, stage: row.processingStage });
      return edit(system, chunk, signal);
    };
    await workerWith(storage, provider).runOnce();
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.map((item) => item.completed)).toEqual(progress.map((_item, index) => index));
    expect(new Set(progress.map((item) => item.total))).toEqual(new Set([progress.length]));
    expect(new Set(progress.map((item) => item.stage))).toEqual(new Set(['editing']));
    expect(
      await sql.query('SELECT status, "editingCompleted", "editingTotal" FROM document WHERE id = $1', [id])
    ).toEqual([{ status: 'completed', editingCompleted: null, editingTotal: null }]);
  });

  it('keeps one job processing through two delayed retries and fails on the third provider call', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await assessmentDocxFixture());
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(async () => {
      throw Object.assign(new Error('private provider detail'), { status: 503 });
    });
    const worker = () => workerWith(storage, provider);
    await worker().runOnce();
    expect(await sql.query('SELECT status, "failureCode" FROM document')).toEqual([
      { status: 'processing', failureCode: null }
    ]);
    const [first] = await sql.query('SELECT "processingAttemptId", "processingDeadline" FROM document');
    expect(await worker().runOnce()).toBe(false);
    for (let retry = 0; retry < 2; retry++) {
      await database.query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [id]);
      await worker().runOnce();
    }
    expect(provider.edit).toHaveBeenCalledTimes(3);
    expect(await sql.query('SELECT status, phase, assessment, "failureCode" FROM document')).toEqual([
      { status: 'failed', phase: 'rewrite', assessment: initialAssessment, failureCode: 'provider' }
    ]);
    expect(await sql.query('SELECT "processingAttemptId", "processingDeadline" FROM document')).toEqual([first]);
    expect(storage.revisions.size).toBe(0);
    expect(await reservations(id)).toEqual(['released']);
    expect(await worker().runOnce()).toBe(false);
  });

  it('resumes each chunk with its own retry budget and reuses successful requests across restarts', async () => {
    await enqueueRewrite();
    const storage = privateStorage(await readerFixture(textParagraph('word '.repeat(2000))));
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    const calls = new Map<string, number>();
    provider.edit = vi.fn(async (system, chunk, signal) => {
      const count = (calls.get(chunk.id) ?? 0) + 1;
      calls.set(chunk.id, count);
      if (count < 3) throw Object.assign(new Error('private'), { code: 'ECONNRESET' });
      return edit(system, chunk, signal);
    });
    const worker = () => workerWith(storage, provider);
    for (let turn = 0; turn < 30; turn++) {
      expect(await worker().runOnce()).toBe(true);
      const [row] = await sql.query('SELECT status FROM document');
      if (row.status === 'completed') break;
      expect(row.status).toBe('processing');
      expect(await worker().runOnce()).toBe(false);
      await database.query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second'`);
    }
    expect(await sql.query('SELECT status FROM document')).toEqual([{ status: 'completed' }]);
    expect(calls.size).toBeGreaterThan(1);
    expect([...calls.values()]).toEqual(Array(calls.size).fill(3));
    expect(storage.revisions.size).toBe(1);
    expect(await worker().runOnce()).toBe(false);
    const [{ checkpoints }] = (
      await database.query<{ checkpoints: Record<string, { state: string; attempts: number }> }>(
        'SELECT "providerRequests" AS checkpoints FROM document'
      )
    ).rows;
    expect(Object.values(checkpoints).map(({ state, attempts }) => ({ state, attempts }))).toEqual(
      Array(calls.size).fill({ state: 'succeeded', attempts: 3 })
    );
  });
  it.each([400, 401, 403])('makes only one call for permanent HTTP %s failures', async (status) => {
    await enqueueRewrite();
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(async () => {
      throw Object.assign(new Error('private'), { status });
    });
    const storage = privateStorage(await assessmentDocxFixture());
    const worker = workerWith(storage, provider);
    await worker.runOnce();
    expect(provider.edit).toHaveBeenCalledTimes(1);
    expect(await sql.query('SELECT status, "failureCode" FROM document')).toEqual([
      { status: 'failed', failureCode: 'provider' }
    ]);
    expect(storage.revisions.size).toBe(0);
    expect(await worker.runOnce()).toBe(false);
  });

  it('expires a scheduled retry at the original deadline without another request', async () => {
    const id = await enqueueRewrite();
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(async () => {
      throw Object.assign(new Error('private'), { status: 503 });
    });
    const storage = privateStorage(await assessmentDocxFixture());
    const worker = workerWith(storage, provider);
    await worker.runOnce();
    await database.query(`UPDATE document SET "processingDeadline" = now() - interval '1 second' WHERE id = $1`, [id]);
    expect(await worker.runOnce()).toBe(false);
    expect(provider.edit).toHaveBeenCalledTimes(1);
    expect(await sql.query('SELECT status, "failureCode" FROM document')).toEqual([
      { status: 'failed', failureCode: 'deadline' }
    ]);
  });

  it('recovers a committed chunk after a hard stop without sending that chunk again', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await readerFixture(textParagraph('word '.repeat(2000))));
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    let starts = 0;
    let unavailable = false;
    const interruptedJobs = new DocumentJobs({
      query: async (query, values) => {
        if (query.includes('WITH started AS') && ++starts === 2) unavailable = true;
        if (unavailable) throw new Error('Database connection lost');
        return sql.query(query, values);
      }
    });
    await expect(new AssessmentWorker(interruptedJobs, storage, provider, 'rules', timeouts).runOnce()).rejects.toThrow(
      'Database connection lost'
    );
    const [before] = await sql.query('SELECT "processingAttemptId", "processingDeadline" FROM document');
    expect(provider.edit).toHaveBeenCalledTimes(1);
    const firstChunk = vi.mocked(provider.edit).mock.calls[0][1].id;
    await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second' WHERE id = $1`, [id]);
    await workerWith(storage, provider, { processingTimeoutMs: 1000, providerTimeoutMs: 60000 }).runOnce();
    expect(await sql.query('SELECT status FROM document')).toEqual([{ status: 'completed' }]);
    expect(await sql.query('SELECT "processingAttemptId", "processingDeadline" FROM document')).toEqual([before]);
    expect(vi.mocked(provider.edit).mock.calls.filter(([, chunk]) => chunk.id === firstChunk)).toHaveLength(1);
    expect(storage.revisions.size).toBe(1);
    expect(await reservations(id)).toEqual(['charged']);
  });

  it('fails a request with an unknown outcome after a hard stop instead of repeating it', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await assessmentDocxFixture());
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    let unavailable = false;
    const interruptedJobs = new DocumentJobs({
      query: async (query, values) => {
        if (query.includes('WITH finished AS')) unavailable = true;
        if (unavailable) throw new Error('Database connection lost');
        return sql.query(query, values);
      }
    });
    await expect(new AssessmentWorker(interruptedJobs, storage, provider, 'rules', timeouts).runOnce()).rejects.toThrow(
      'Database connection lost'
    );
    await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second'`);
    expect(await workerWith(storage, provider).runOnce()).toBe(false);
    expect(provider.edit).toHaveBeenCalledTimes(1);
    expect(await sql.query('SELECT status, "failureCode" FROM document')).toEqual([
      { status: 'failed', failureCode: 'interrupted' }
    ]);
    expect(storage.revisions.size).toBe(0);
    expect(await reservations(id)).toEqual(['released']);
  });
  it('rotates only the claim token on retry and rejects stale request writes and publication', async () => {
    const id = await enqueue();
    const first = await jobs.claim(timeouts);
    const request = await jobs.startRequest(first, 'edit:chunk', 'input');
    expect(request.attempts).toBe(1);
    expect(await jobs.finishRequest(first, 'edit:chunk', { ...request, state: 'retry' }, 1000)).toBe(true);
    expect(await jobs.claim(timeouts)).toBeNull();
    expect(await jobs.recover()).toBe(0);
    expect(await jobs.startRequest(first, 'edit:chunk', 'input')).toBeNull();
    expect(await jobs.finishRequest(first, 'edit:chunk', { ...request, state: 'succeeded', outcome: {} })).toBe(false);
    expect(await jobs.publishAssessment(first, initialAssessment, preview)).toBe(false);
    await database.query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [id]);
    const claims = await Promise.all([jobs.claim(timeouts), new DocumentJobs(sql).claim(timeouts)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const next = claims.find(Boolean);
    expect(next.claimToken).not.toBe(first.claimToken);
    expect(next.processingAttemptId).toBe(first.processingAttemptId);
    expect(next.processingDeadline).toEqual(first.processingDeadline);
    expect(next.processingStartedAt).toEqual(first.processingStartedAt);
    expect(await jobs.fail(first, 'provider')).toBe(false);
    expect(await jobs.startRequest(next, 'edit:chunk', 'changed input')).toBeNull();
    expect((await jobs.startRequest(next, 'edit:chunk', 'input')).attempts).toBe(2);
  });

  it('claims a durable queued rewrite once across worker instances and publishes once', async () => {
    const id = await enqueueRewrite();
    const restartedWorker = new DocumentJobs(sql);
    const [first, second] = await Promise.all([jobs.claim(timeouts), restartedWorker.claim(timeouts)]);
    const claim = first ?? second;
    expect(claim.id).toBe(id);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await jobs.saveRevision(claim, { key: `${randomUUID()}.docx`, size: 123 }, noNotices)).toBe(true);
    expect(await jobs.saveRevision(claim, { key: `${randomUUID()}.docx`, size: 123 }, noNotices)).toBe(false);
    expect(await jobs.complete(claim)).toBe(true);
    expect(await restartedWorker.complete(claim)).toBe(false);
    expect(await reservations(id)).toEqual(['charged']);
    expect(await jobs.claim(timeouts)).toBeNull();
  });
  it('fails interrupted and expired work and rejects late publication or lease renewal', async () => {
    await enqueue();
    const interrupted = await jobs.claim(timeouts);
    await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second' WHERE id = $1`, [
      interrupted.id
    ]);
    expect(await jobs.heartbeat(interrupted)).toBe(false);
    expect(await new DocumentJobs(sql).recover()).toBe(1);
    expect(await jobs.publishAssessment(interrupted, initialAssessment, preview)).toBe(false);
    const rewrite = await enqueueRewrite();
    const expired = await jobs.claim(timeouts);
    await database.query(`UPDATE document SET "processingDeadline" = now() - interval '1 second' WHERE id = $1`, [
      expired.id
    ]);
    expect(await jobs.saveRevision(expired, { key: `${randomUUID()}.docx`, size: 123 }, noNotices)).toBe(false);
    expect(await jobs.recover()).toBe(1);
    expect(await jobs.recover()).toBe(0);
    expect(await jobs.claim(timeouts)).toBeNull();
    const rows = await sql.query(
      'SELECT status, phase, "failureCode", assessment, strength FROM document ORDER BY "createdAt", id'
    );
    expect(rows).toEqual([
      { status: 'failed', phase: 'assessment', failureCode: 'interrupted', assessment: null, strength: null },
      { status: 'failed', phase: 'rewrite', failureCode: 'deadline', assessment: initialAssessment, strength: 50 }
    ]);
    expect(await reservations(rewrite)).toEqual(['released']);
  });

  it('retries a busy detector twice, then fails without a partial result or provider details', async () => {
    const id = await enqueue();
    const provider = faithfulRevisionProvider();
    provider.detect = vi.fn(async () => {
      throw Object.assign(new Error('private document text'), { status: 429 });
    });
    const worker = () => workerWith(privateStorage(fixtureBytes), provider);
    await worker().runOnce();
    expect(await sql.query('SELECT status, assessment FROM document')).toEqual([
      { status: 'processing', assessment: null }
    ]);
    for (let retry = 0; retry < 2; retry++) {
      await database.query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second' WHERE id = $1`, [id]);
      await worker().runOnce();
    }
    expect(provider.detect).toHaveBeenCalledTimes(3);
    const rows = await sql.query('SELECT status, assessment, "failureCode", "providerRequests" FROM document');
    expect(rows[0]).toMatchObject({ status: 'failed', assessment: null, failureCode: 'provider' });
    expect(JSON.stringify(rows)).not.toContain('private document text');
  });

  it('publishes an unavailable result so a short document can still be edited', async () => {
    const id = await enqueue();
    const provider = faithfulRevisionProvider();
    provider.detect = async () => ({
      ...detectionFixture(0),
      status: 'unavailable',
      rate: null,
      aiScore: null,
      reason: 'too_short',
      tokenCount: 0,
      segmentCount: 0
    });
    await workerWith(privateStorage(fixtureBytes), provider).runOnce();
    expect(await sql.query('SELECT status, assessment FROM document WHERE id = $1', [id])).toMatchObject([
      { status: 'assessed', assessment: { status: 'unavailable', rate: null, reason: 'too_short' } }
    ]);
  });

  it('keeps document text out of the detection checkpoint', async () => {
    await enqueue();
    await workerWith(privateStorage(fixtureBytes), faithfulRevisionProvider()).runOnce();
    const rows = await sql.query('SELECT "providerRequests" FROM document');
    expect(JSON.stringify(rows)).not.toContain('In order to assess');
  });

  it('fails an unreadable original without a partial result or calling the provider', async () => {
    const id = await enqueue();
    const provider = faithfulRevisionProvider();
    provider.edit = vi.fn(provider.edit);
    const worker = new AssessmentWorker(
      jobs,
      { read: async () => Buffer.from('not a docx'), write: async () => {}, remove: async () => {} },
      provider,
      'rules',
      timeouts
    );
    await worker.runOnce();
    expect(provider.edit).not.toHaveBeenCalled();
    expect(await sql.query('SELECT status, assessment, "failureCode" FROM document WHERE id = $1', [id])).toEqual([
      { status: 'failed', assessment: null, failureCode: 'provider' }
    ]);
  });

  it.each([
    { processingTimeoutMs: 900000, providerTimeoutMs: 100, failureCode: 'provider' },
    { processingTimeoutMs: 100, providerTimeoutMs: 60000, failureCode: 'deadline' }
  ])('bounds a stalled provider and ignores its late response: $failureCode', async (settings) => {
    const id = await enqueueRewrite();
    const bytes = await readerFixture(textParagraph('A short document.'));
    const completions: ((value: unknown) => void)[] = [];
    let started: () => void;
    const provider = {
      detect: faithfulRevisionProvider().detect,
      edit: vi.fn(
        () =>
          new Promise((resolve) => {
            completions.push(resolve);
            started();
          })
      )
    };
    const worker = new AssessmentWorker(
      jobs,
      { read: async () => bytes, write: async () => {}, remove: async () => {} },
      provider,
      'rules',
      settings
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      for (let attempt = 0; attempt < (settings.failureCode === 'provider' ? 3 : 1); attempt++) {
        const called = new Promise<void>((resolve) => {
          started = resolve;
        });
        const running = worker.runOnce();
        await called;
        await vi.advanceTimersByTimeAsync(200);
        await running;
        await database.query(`UPDATE document SET "nextRequestAt" = now() - interval '1 second'`);
      }
      for (const finish of completions) finish({ edits: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.edit).toHaveBeenCalledTimes(settings.failureCode === 'provider' ? 3 : 1);
      expect(await sql.query('SELECT status, "failureCode" FROM document WHERE id = $1', [id])).toEqual([
        { status: 'failed', failureCode: settings.failureCode }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  function privateStorage(original: Buffer) {
    const revisions = new Map<string, Buffer>();
    return {
      revisions,
      read: async (key?: string) => Buffer.from((key && revisions.get(key)) ?? original),
      write: async (key: string, bytes: Buffer) => {
        revisions.set(key, Buffer.from(bytes));
      },
      remove: async (key: string) => {
        revisions.delete(key);
      }
    };
  }

  it('publishes only a complete validated revision and retains the original', async () => {
    const id = await enqueueRewrite();
    const original = await assessmentDocxFixture();
    const storage = privateStorage(original);
    const stages: string[] = [];
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    provider.edit = async (system, chunk, signal) => {
      const [row] = await sql.query('SELECT "processingStage" FROM document WHERE id = $1', [id]);
      stages.push(row.processingStage);
      expect(storage.revisions.size).toBe(0);
      return edit(system, chunk, signal);
    };
    await workerWith(storage, provider).runOnce();
    const [row] = await sql.query(
      'SELECT status, "processingStage", "revisedKey", "revisedSize" FROM document WHERE id = $1',
      [id]
    );
    expect(row.status).toBe('completed');
    expect(row.processingStage).toBeNull();
    expect(storage.revisions.get(row.revisedKey)?.length).toBe(row.revisedSize);
    expect(stages).toEqual(['editing']);
    expect(await storage.read()).toEqual(original);
  });

  it('persists kept-passage and unedited-element notices with the published revision', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await assessmentDocxFixture());
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    provider.edit = async (system, chunk, signal) => {
      const result = (await edit(system, chunk, signal)) as { edits: { id: string; text: string }[] };
      return { edits: result.edits.map((span, index) => (index ? span : { ...span, text: `${span.text} (2031)` })) };
    };
    await workerWith(storage, provider).runOnce();
    const [row] = await sql.query('SELECT status, "revisionNotices" FROM document WHERE id = $1', [id]);
    expect(row.status).toBe('completed');
    expect(row.revisionNotices).toEqual({
      keptPassages: [{ check: 'reference', span: expect.any(String), excerpt: expect.any(String) }],
      uneditedElements: []
    });
    expect(JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls)).not.toContain('2031');
  });

  it('keeps the assessment and strength but releases the slot after invalid editing responses exhaust retries', async () => {
    const id = await enqueueRewrite(30);
    const original = await readerFixture(textParagraph('word '.repeat(10000)));
    const storage = privateStorage(original);
    let requests = 0;
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    provider.edit = async (system, chunk, signal) => {
      requests++;
      return requests >= 2 ? { edits: [] } : edit(system, chunk, signal);
    };
    await workerWith(storage, provider).runOnce();
    expect(requests).toBe(2);
    for (let retry = 0; retry < 2; retry++) {
      expect(await reservations(id)).toEqual(['active']);
      await sql.query('UPDATE document SET "nextRequestAt" = now() - interval \'1 second\'');
      await workerWith(storage, provider).runOnce();
    }
    expect(requests).toBe(4);
    expect(vi.mocked(Logger.prototype.warn)).toHaveBeenCalledWith('Document processing failed: structure.');
    expect(JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls)).not.toContain('word word');
    expect(storage.revisions.size).toBe(0);
    expect(await storage.read()).toEqual(original);
    expect(
      await sql.query(
        'SELECT status, phase, strength, assessment, preview, "failureCode", "revisedKey", "revisedSize", "revisionNotices", "editingCompleted", "editingTotal" FROM document WHERE id = $1',
        [id]
      )
    ).toEqual([
      {
        status: 'failed',
        phase: 'rewrite',
        strength: 30,
        assessment: initialAssessment,
        preview,
        failureCode: 'structure',
        revisedKey: null,
        revisedSize: null,
        revisionNotices: null,
        editingCompleted: null,
        editingTotal: null
      }
    ]);
    expect(await reservations(id)).toEqual(['released']);
  });

  it('applies the provider wait per request instead of to the entire attempt', async () => {
    await enqueueRewrite();
    const storage = privateStorage(await readerFixture(textParagraph('word '.repeat(2000))));
    const provider = faithfulRevisionProvider();
    const edit = provider.edit;
    let requests = 0;
    provider.edit = async (system, chunk, signal) => {
      requests++;
      await new Promise((resolve) => setTimeout(resolve, 45));
      return edit(system, chunk, signal);
    };
    await workerWith(storage, provider, { processingTimeoutMs: 900000, providerTimeoutMs: 120 }).runOnce();
    expect(requests).toBeGreaterThan(2);
    expect(await sql.query('SELECT status FROM document')).toEqual([{ status: 'completed' }]);
  });

  it.each(['deadline', 'shutdown', 'deletion', 'lease'] as const)(
    'prevents publication when %s ends an editing request',
    async (ending) => {
      const id = await enqueueRewrite();
      const storage = privateStorage(await assessmentDocxFixture());
      const shutdown = new AbortController();
      const provider = faithfulRevisionProvider();
      const edit = provider.edit;
      provider.edit = async (system, chunk, signal) => {
        if (ending === 'deadline')
          await database.query(`UPDATE document SET "processingDeadline" = now() - interval '1 second' WHERE id = $1`, [
            id
          ]);
        if (ending === 'lease')
          await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second' WHERE id = $1`, [
            id
          ]);
        if (ending === 'deletion') await database.query('DELETE FROM document WHERE id = $1', [id]);
        if (ending === 'shutdown') shutdown.abort();
        return edit(system, chunk, signal);
      };
      await workerWith(storage, provider).runOnce(shutdown.signal);
      expect(storage.revisions.size).toBe(0);
      expect(await sql.query('SELECT status, "revisedKey", assessment FROM document')).toEqual(
        ending === 'deletion' ? [] : [{ status: 'failed', revisedKey: null, assessment: initialAssessment }]
      );
      expect(await reservations(id)).toEqual(ending === 'deletion' ? [] : ['released']);
    }
  );

  it('cleans a fully written private revision if the claim is lost before it is saved', async () => {
    const id = await enqueueRewrite();
    const original = await assessmentDocxFixture();
    const storage = privateStorage(original);
    const write = storage.write;
    storage.write = async (key, bytes) => {
      await write(key, bytes);
      await database.query(`UPDATE document SET "leaseExpiresAt" = now() - interval '1 second' WHERE id = $1`, [id]);
    };
    await workerWith(storage, faithfulRevisionProvider()).runOnce();
    expect(storage.revisions.size).toBe(0);
    expect(await storage.read()).toEqual(original);
    expect(await sql.query('SELECT status, "revisedKey" FROM document')).toEqual([
      { status: 'failed', revisedKey: null }
    ]);
    expect(await reservations(id)).toEqual(['released']);
  });

  it('removes the saved revision when publication finds the document deleted', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await assessmentDocxFixture());
    const deletingJobs = new DocumentJobs({
      query: async (query, values) => {
        if (query.includes('WITH completed AS')) await database.query('DELETE FROM document WHERE id = $1', [id]);
        return sql.query(query, values);
      }
    });
    await new AssessmentWorker(deletingJobs, storage, faithfulRevisionProvider(), 'rules', timeouts).runOnce();
    expect(storage.revisions.size).toBe(0);
    expect(await sql.query('SELECT id FROM document')).toEqual([]);
    expect(await reservations(id)).toEqual([]);
  });

  it('keeps a published revision if the completion acknowledgement is lost', async () => {
    const id = await enqueueRewrite();
    const storage = privateStorage(await assessmentDocxFixture());
    const uncertainJobs = new DocumentJobs({
      query: async (query, values) => {
        const result = await sql.query(query, values);
        if (query.includes('WITH completed AS')) throw new Error('Lost acknowledgement');
        return result;
      }
    });
    await new AssessmentWorker(uncertainJobs, storage, faithfulRevisionProvider(), 'rules', timeouts).runOnce();
    const [row] = await sql.query('SELECT status, "revisedKey" FROM document');
    expect(row.status).toBe('completed');
    expect(storage.revisions.has(row.revisedKey)).toBe(true);
    expect(await reservations(id)).toEqual(['charged']);
  });
});
