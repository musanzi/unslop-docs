import { ConfigService } from '@nestjs/config';
import { FindAllowanceHandler } from './queries/find-allowance.handler';
import { AllowanceClock, MonthlyAllowance } from './monthly-allowance';
import { FindDocumentHandler } from './queries/find-document.handler';
import { DataSource } from 'typeorm';
import { UsersController } from '../users/controllers';
import { User } from '../users/entities';
import { Role } from '../roles/entities';
import { userFixture } from '@api/shared/testing/fixtures';
import { FindUsersHandler } from '../users/queries/handlers/find-users.handler';
import { FindUserByEmailHandler } from '../users/queries/handlers/find-user-by-email.handler';
import { ExportUsersCsvHandler } from '../users/queries/handlers/export-users-csv.handler';
import { StatsController } from '../stats/controllers';
import { FindStatsHandler } from '../stats/queries/handlers/find-stats.handler';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthGuard, RolesGuard } from '../auth/guards';
import { ApiResponseInterceptor } from '@api/shared/interceptors';
import { ApiExceptionFilter } from '@api/shared/filters';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentsController } from './documents.controller';
import { Document } from './entities/document.entity';
import { UploadDocumentHandler } from './commands/upload-document.handler';
import { RetryDocumentHandler } from './commands/retry-document.handler';
import { FindDocumentsHandler } from './queries/find-documents.handler';
import { DownloadDocumentHandler } from './queries/download-document.handler';
import { DeleteDocumentHandler } from './commands/delete-document.handler';
import { UnslopifyDocumentHandler } from './commands/unslopify-document.handler';
import { FindDocumentPreviewHandler } from './queries/find-document-preview.handler';
import { styleAssessmentFixture } from '@api/shared/testing/style-assessment-fixtures';
import { DocumentPageValidator } from './document-page-validator';
import { DocumentStorage } from './document-storage';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';
import { languageSamples } from '@api/shared/testing/docx-language-fixtures';
import { docxFixture } from '@api/shared/testing/docx-fixture';

describe('Private documents HTTP', () => {
  let app: INestApplication;
  let base: string;
  let root: string;
  let records: Document[] = [];
  let databaseFailure = '';
  let settleCommit: (() => void) | undefined;
  const deleted = new Set<string>();
  const query = async (sql: string, values: unknown[]) => {
    if (sql.startsWith('SELECT * FROM document'))
      return records.filter((record) => record.id === values[0] && record.ownerId === values[1]);
    if (sql.startsWith('DELETE FROM document')) {
      deleted.add(values[0] as string);
      return [];
    }
    if (sql.startsWith('UPDATE document')) {
      const record = records.find((record) => record.id === values[0]);
      Object.assign(record, { status: 'queued', failureCode: null });
      if (sql.includes("phase = 'rewrite'")) Object.assign(record, { phase: 'rewrite', strength: values[1] });
      return [record];
    }
    if (sql.includes('GROUP BY'))
      return [
        {
          status: 'GOLD',
          used: records.filter((r) => r.ownerId === values[0] && r.status === 'completed').length,
          reserved: records.filter(
            (r) => r.ownerId === values[0] && r.phase === 'rewrite' && ['queued', 'processing'].includes(r.status)
          ).length
        }
      ];
    return [];
  };
  const repository = {
    create: (data) => Object.assign(new Document(), { id: randomUUID(), createdAt: new Date() }, data),
    findOne: async ({ where }) => repository.findOneBy(where),
    findOneBy: async (where) => {
      if (databaseFailure === 'unavailable') throw new Error('Database unavailable');
      return records.find((record) => Object.entries(where).every(([key, value]) => record[key] === value)) ?? null;
    },
    findAndCount: async ({ where, order, skip, take }) => {
      const matching = records
        .filter((record) => record.ownerId === where.ownerId)
        .sort((a, b) => {
          const direction = order.createdAt === 'DESC' ? -1 : 1;
          return direction * (a.createdAt.getTime() - b.createdAt.getTime()) || b.id.localeCompare(a.id);
        });
      return [matching.slice(skip, skip + take), matching.length];
    },
    manager: {
      transaction: async (work) => {
        const pending = [...records];
        const result = await work({
          query,
          getRepository: () => ({
            save: async (record) => {
              if (databaseFailure === 'save') throw new Error('Write failed');
              pending.push(record);
              return record;
            }
          })
        });
        if (databaseFailure === 'late-commit') {
          settleCommit = () => {
            records = pending;
          };
          throw new Error('Connection lost while committing');
        }
        if (databaseFailure === 'commit' || databaseFailure === 'unavailable') throw new Error('Commit failed');
        records = pending.filter((record) => !deleted.has(record.id));
        deleted.clear();
        if (databaseFailure === 'acknowledgement') throw new Error('Commit acknowledgement lost');
        return result;
      }
    }
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'unslop-documents-'));
    const users = [userFixture({ id: 'owner' })];
    const userBuilder = {
      select: () => userBuilder,
      leftJoinAndSelect: () => userBuilder,
      innerJoinAndSelect: () => userBuilder,
      orderBy: () => userBuilder,
      skip: () => userBuilder,
      take: () => userBuilder,
      where: () => userBuilder,
      getMany: async () => users,
      getManyAndCount: async () => [users, users.length],
      getOneOrFail: async () => users[0]
    };
    const adapter = new ExpressAdapter();
    const adapterHost = new HttpAdapterHost();
    adapterHost.httpAdapter = adapter;
    const module = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        ServeStaticModule.forRoot({ rootPath: join(root, 'public'), serveRoot: '/uploads' })
      ],
      controllers: [DocumentsController, UsersController, StatsController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({ ADMIN_EMAIL: 'admin@example.com' }) },
        FindUsersHandler,
        FindUserByEmailHandler,
        ExportUsersCsvHandler,
        FindStatsHandler,
        AuthGuard,
        RolesGuard,
        UploadDocumentHandler,
        { provide: DocumentPageValidator, useValue: { validate: async () => 1 } },
        RetryDocumentHandler,
        UnslopifyDocumentHandler,
        FindDocumentPreviewHandler,
        MonthlyAllowance,
        AllowanceClock,
        FindDocumentsHandler,
        FindAllowanceHandler,
        FindDocumentHandler,
        DownloadDocumentHandler,
        DeleteDocumentHandler,
        {
          provide: DocumentStorage,
          useFactory: () => new DocumentStorage(join(root, 'private'), join(root, 'public'))
        },
        { provide: getRepositoryToken(Document), useValue: repository },
        { provide: getRepositoryToken(User), useValue: { createQueryBuilder: () => userBuilder } },
        {
          provide: DataSource,
          useValue: {
            query,
            transaction: repository.manager.transaction,
            getRepository: (entity) => {
              if (entity !== User && entity !== Role) throw new Error('Admin document access is forbidden');
              return { count: async () => 1 };
            }
          }
        }
      ]
    })
      .overrideProvider(HttpAdapterHost)
      .useValue(adapterHost)
      .compile();
    app = module.createNestApplication(adapter);
    app.use((req, _res, next) => {
      const id = req.headers['test-identity'];
      req.isAuthenticated = () => typeof id === 'string';
      if (id) req.user = { id, isAdmin: id === 'admin', roles: ['user'] };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalGuards(module.get(AuthGuard), module.get(RolesGuard));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost)));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  beforeEach(async () => {
    records = [];
    deleted.clear();
    databaseFailure = '';
    await rm(join(root, 'private'), { recursive: true, force: true });
    await mkdir(join(root, 'private'));
  });
  afterAll(async () => {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });

  async function upload(bytes: Buffer, name = 'essay.docx', identity = 'owner') {
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)]), name);
    return fetch(`${base}/documents`, { method: 'POST', headers: identity ? { 'test-identity': identity } : {}, body });
  }
  async function list(identity = 'owner', query = '') {
    return fetch(`${base}/documents${query}`, { headers: identity ? { 'test-identity': identity } : {} });
  }
  async function download(id: string, identity = 'owner') {
    return fetch(`${base}/documents/${id}/original`, { headers: identity ? { 'test-identity': identity } : {} });
  }
  const assessment = styleAssessmentFixture(40);
  const preview = {
    blocks: [{ kind: 'paragraph', level: null, text: 'Private student text.', inlines: [], rows: null, reason: null }]
  };
  async function uploadAssessed(identity = 'owner') {
    const { data } = await (await upload(await docxFixture(), 'essay.docx', identity)).json();
    Object.assign(
      records.find((record) => record.id === data.id),
      { status: 'assessed', assessment, preview }
    );
    return data as { id: string };
  }
  function unslopify(id: string, body?: unknown, identity = 'owner') {
    return fetch(`${base}/documents/${id}/unslopify`, {
      method: 'POST',
      headers: {
        ...(identity ? { 'test-identity': identity } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  function previewOf(id: string, identity = 'owner') {
    return fetch(`${base}/documents/${id}/preview`, { headers: identity ? { 'test-identity': identity } : {} });
  }

  it('unslopifies an owned assessed document with a validated strength and refuses duplicates and strangers', async () => {
    const { id } = await uploadAssessed();
    expect((await unslopify(id, { strength: 80 }, '')).status).toBe(401);
    const missing = await unslopify(randomUUID(), { strength: 80 });
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    for (const [target, identity] of [
      [id, 'other'],
      [id, 'admin'],
      ['invalid', 'owner']
    ]) {
      const denied = await unslopify(target, { strength: 80 }, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missingBody);
    }
    for (const strength of [0, 101, 50.5, 'strong', null]) {
      const invalid = await unslopify(id, { strength });
      expect(invalid.status).toBe(400);
    }
    expect(
      await (await fetch(`${base}/documents/${id}`, { headers: { 'test-identity': 'owner' } })).json()
    ).toMatchObject({
      data: { status: 'assessed', strength: null }
    });
    const response = await unslopify(id, { strength: 80 });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      data: {
        id,
        status: 'queued',
        phase: 'rewrite',
        strength: 80,
        processingStage: null,
        progress: null,
        failure: null
      }
    });
    const duplicate = await unslopify(id, { strength: 80 });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ message: 'Rewriting is already queued for this document.' });
    const { id: second } = await uploadAssessed();
    expect(await (await unslopify(second)).json()).toMatchObject({ data: { status: 'queued', strength: 50 } });
    expect(
      await (await fetch(`${base}/documents/allowance`, { headers: { 'test-identity': 'owner' } })).json()
    ).toMatchObject({ data: { reserved: 2, remaining: 33 } });
    for (const status of ['stored', 'queued', 'processing', 'failed'] as const) {
      Object.assign(records[1], { status, phase: 'assessment', assessment: null });
      const rejected = await unslopify(second, { strength: 10 });
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({ message: 'Only assessed documents can be rewritten.' });
    }
    Object.assign(records[1], { status: 'completed', phase: 'rewrite', assessment });
    expect(await (await unslopify(second)).json()).toMatchObject({
      message: 'This document already has a revised version.'
    });
  });

  it('serves the private read-only preview to the owner once the document is assessed', async () => {
    const { data } = await (await upload(await docxFixture())).json();
    const before = await previewOf(data.id);
    expect(before.status).toBe(404);
    const missingBody = await before.json();
    Object.assign(records[0], { status: 'assessed', assessment, preview });
    const response = await previewOf(data.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ data: preview });
    for (const identity of ['other', 'admin']) {
      const denied = await previewOf(data.id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missingBody);
    }
    expect(await (await previewOf('invalid')).json()).toEqual(missingBody);
    expect(await (await previewOf(randomUUID())).json()).toEqual(missingBody);
    expect((await previewOf(data.id, '')).status).toBe(401);
    Object.assign(records[0], { status: 'failed', phase: 'rewrite', failureCode: 'provider', strength: 50 });
    expect((await previewOf(data.id)).status).toBe(200);
  });

  it('retries an owned failed document privately and refuses signed-out, foreign and non-failed documents', async () => {
    const { data } = await (await upload(await docxFixture())).json();
    const retry = (id: string, identity = 'owner') =>
      fetch(`${base}/documents/${id}/retry`, {
        method: 'POST',
        headers: identity ? { 'test-identity': identity } : {}
      });
    records[0].status = 'failed';
    records[0].failureCode = 'provider';
    expect((await retry(data.id, '')).status).toBe(401);
    const missing = await retry(randomUUID());
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    for (const [id, identity] of [
      [data.id, 'other'],
      [data.id, 'admin'],
      ['invalid', 'owner']
    ]) {
      const denied = await retry(id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missingBody);
    }
    const response = await retry(data.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ data: { id: data.id, status: 'queued', failure: null } });
    for (const status of ['stored', 'queued', 'processing', 'assessed', 'completed'] as const) {
      records[0].status = status;
      const rejected = await retry(data.id);
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({ message: 'Only failed documents can be retried.' });
    }
  });

  it('returns only the signed-in owner allowance with private caching', async () => {
    await upload(await docxFixture());
    const unreserved = await fetch(`${base}/documents/allowance`, { headers: { 'test-identity': 'owner' } });
    expect(await unreserved.json()).toMatchObject({ data: { used: 0, reserved: 0, remaining: 35 } });
    await unslopify((await uploadAssessed()).id);
    const response = await fetch(`${base}/documents/allowance?ownerId=other`, {
      headers: { 'test-identity': 'owner' }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      data: { status: 'GOLD', limit: 35, used: 0, reserved: 1, remaining: 34 }
    });
    for (const identity of ['other', 'admin']) {
      const privateResponse = await fetch(`${base}/documents/allowance?ownerId=owner`, {
        headers: { 'test-identity': identity }
      });
      expect(await privateResponse.json()).toMatchObject({ data: { reserved: 0, remaining: 35 } });
    }
    expect((await fetch(`${base}/documents/allowance`)).status).toBe(401);
  });

  it('returns the allowance limit and reset on HTTP 409 and leaves the preview waiting', async () => {
    const documents: { id: string }[] = [];
    for (let index = 0; index < 36; index++) documents.push(await uploadAssessed());
    for (const { id } of documents.slice(0, 35)) expect((await unslopify(id)).status).toBe(200);
    const before = await readdir(join(root, 'private'));
    const blocked = await unslopify(documents[35].id);
    expect(blocked.status).toBe(409);
    expect(blocked.headers.get('cache-control')).toBe('private, no-store');
    expect(await blocked.json()).toMatchObject({
      message: expect.stringMatching(/GOLD allowance of 35.*resets on .*UTC/)
    });
    expect(await readdir(join(root, 'private'))).toEqual(before);
    expect(await (await list()).json()).toMatchObject({ data: { total: 36 } });
    expect(
      await (await fetch(`${base}/documents/${documents[35].id}`, { headers: { 'test-identity': 'owner' } })).json()
    ).toMatchObject({
      data: {
        status: 'assessed',
        phase: 'assessment',
        strength: null,
        assessment: { rubric: assessment.rubric, style: assessment.style }
      }
    });
    expect((await previewOf(documents[35].id)).status).toBe(200);
  });

  function remove(id: string, identity = 'owner') {
    return fetch(`${base}/documents/${id}`, {
      method: 'DELETE',
      headers: identity ? { 'test-identity': identity } : {}
    });
  }

  it('deletes a queued or processing document at once with every stored file', async () => {
    const { data: queued } = await (await upload(await docxFixture())).json();
    expect((await remove(queued.id, '')).status).toBe(401);
    expect((await remove(queued.id)).status).toBe(204);
    expect(await readdir(join(root, 'private'))).toEqual([]);
    const { data: active } = await (await upload(await docxFixture())).json();
    const revisedKey = `${randomUUID()}.docx`;
    await writeFile(join(root, 'private', revisedKey), 'revised bytes');
    Object.assign(records[0], {
      status: 'processing',
      phase: 'rewrite',
      assessment,
      preview,
      strength: 50,
      processingStage: 'final-assessment',
      revisedKey,
      revisedSize: 13
    });
    expect((await remove(active.id)).status).toBe(204);
    expect(await readdir(join(root, 'private'))).toEqual([]);
    expect(await (await list()).json()).toMatchObject({ data: { items: [], total: 0 } });
  });

  it('deletes an owned idle document with every stored file and refuses strangers and repeats', async () => {
    const { data } = await (await upload(await docxFixture())).json();
    const revisedKey = `${randomUUID()}.docx`;
    await writeFile(join(root, 'private', revisedKey), 'revised bytes');
    Object.assign(records[0], { status: 'completed', processingStage: null, revisedKey, revisedSize: 13 });
    const missing = await remove(randomUUID());
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    for (const [id, identity] of [
      [data.id, 'other'],
      [data.id, 'admin'],
      ['invalid', 'owner']
    ]) {
      const denied = await remove(id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missingBody);
    }
    expect((await readdir(join(root, 'private'))).sort()).toEqual([records[0].originalKey, revisedKey].sort());
    expect((await download(data.id)).status).toBe(200);
    const response = await remove(data.id);
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('');
    expect(await readdir(join(root, 'private'))).toEqual([]);
    expect(await (await list()).json()).toMatchObject({ data: { items: [], total: 0 } });
    expect((await fetch(`${base}/documents/${data.id}`, { headers: { 'test-identity': 'owner' } })).status).toBe(404);
    expect((await previewOf(data.id)).status).toBe(404);
    expect((await download(data.id)).status).toBe(404);
    expect(
      (await fetch(`${base}/documents/${data.id}/revised`, { headers: { 'test-identity': 'owner' } })).status
    ).toBe(404);
    const repeated = await remove(data.id);
    expect(repeated.status).toBe(404);
    expect(await repeated.json()).toEqual(missingBody);
  });

  it('uploads a DOCX, lists its metadata and downloads the exact original privately', async () => {
    const bytes = await docxFixture();
    const response = await upload(bytes);
    expect(response.status).toBe(201);
    const { data: document } = await response.json();
    expect(document).toEqual({
      id: expect.any(String),
      filename: 'essay.docx',
      size: bytes.length,
      createdAt: expect.any(String),
      status: 'queued',
      phase: 'assessment',
      processingStage: null,
      progress: null,
      strength: null,
      failure: null
    });
    expect(await (await list()).json()).toMatchObject({ data: { items: [document], total: 1, page: 1, pageSize: 20 } });
    const original = await download(document.id);
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
    expect(original.headers.get('cache-control')).toBe('private, no-store');
    expect(original.headers.get('content-disposition')).toContain('attachment;');
    expect(original.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(await readdir(join(root, 'public'))).toEqual([]);
  });
  it('does not report a failed final assessment for a legacy completed document', async () => {
    const { data: document } = await (await upload(await docxFixture())).json();
    Object.assign(records[0], {
      status: 'completed',
      phase: 'rewrite',
      strength: null,
      assessment: { obsolete: true },
      finalAssessment: null
    });
    const response = await fetch(`${base}/documents/${document.id}`, { headers: { 'test-identity': 'owner' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        assessment: null,
        finalAssessment: null,
        finalScoreUnavailable: false
      }
    });
  });

  it('shows assessment and status only to the owner, including after failure', async () => {
    const { data: document } = await (await upload(await docxFixture())).json();
    const get = (id: string, identity: string) =>
      fetch(`${base}/documents/${id}`, { headers: { 'test-identity': identity } });
    expect(await (await get(document.id, 'owner')).json()).toMatchObject({
      data: { status: 'queued', assessment: null, failure: null }
    });
    records[0].status = 'assessed';
    records[0].assessment = assessment;
    const response = await get(document.id, 'owner');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      data: {
        status: 'assessed',
        assessment: { rubric: assessment.rubric, style: assessment.style },
        finalAssessment: null,
        finalScoreUnavailable: false,
        revisionNotices: null
      }
    });
    Object.assign(records[0], {
      status: 'processing',
      phase: 'rewrite',
      strength: 70,
      processingStage: 'editing',
      editingCompleted: 2,
      editingTotal: 5
    });
    expect(await (await get(document.id, 'owner')).json()).toMatchObject({
      data: { status: 'processing', processingStage: 'editing', progress: { completed: 2, total: 5 }, strength: 70 }
    });
    Object.assign(records[0], {
      status: 'completed',
      processingStage: null,
      editingCompleted: null,
      editingTotal: null,
      finalAssessment: null,
      revisionNotices: { keptPassages: [], uneditedElements: [{ reason: 'image', count: 1 }] }
    });
    expect(await (await get(document.id, 'owner')).json()).toMatchObject({
      data: {
        status: 'completed',
        progress: null,
        assessment: { rubric: assessment.rubric, style: assessment.style },
        finalAssessment: null,
        finalScoreUnavailable: true,
        revisionNotices: { keptPassages: [], uneditedElements: [{ reason: 'image', count: 1 }] }
      }
    });
    Object.assign(records[0], { status: 'assessed', phase: 'assessment', strength: null, revisionNotices: null });
    const missing = await (await get(randomUUID(), 'owner')).json();
    for (const identity of ['other', 'admin']) {
      const denied = await get(document.id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missing);
    }
    Object.assign(records[0], { status: 'failed', failureCode: 'deadline', assessment: null });
    expect(await (await get(document.id, 'owner')).json()).toMatchObject({
      data: {
        status: 'failed',
        assessment: null,
        failure: 'Processing took too long. Your original is still available.'
      }
    });
    expect(await (await get('not-a-uuid', 'owner')).json()).toEqual(missing);
  });

  it('rejects content that is not a DOCX without storing anything', async () => {
    const before = await readdir(join(root, 'private'));
    for (const bytes of [
      Buffer.from('not a DOCX'),
      await docxFixture({ 'word/document.xml': null }),
      await docxFixture({ 'word/document.xml': '<wrong/>' })
    ]) {
      const response = await upload(bytes, 'disguise.docx');
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining('DOCX') });
    }
    expect(await (await list()).json()).toMatchObject({ data: { items: [], total: 0 } });
    expect(await readdir(join(root, 'private'))).toEqual(before);
  });

  it('rejects unprocessable uploads without records or files and accepts an immediate retry', async () => {
    const rejected = [
      [await readerFixture('<w:p><w:r><w:object/></w:r></w:p>'), 'embedded objects'],
      [await readerFixture(textParagraph(languageSamples.spanish)), 'English or French'],
      [Buffer.from('d0cf11e0a1b11ae1', 'hex'), 'password'],
      [await docxFixture({ 'word/media/bomb.bin': Buffer.alloc(20000001) }, undefined, true), 'safe archive limits'],
      [Buffer.from('damaged'), 'damaged']
    ] as const;
    for (const [bytes, message] of rejected) {
      const response = await upload(bytes);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining(message) });
      expect(await (await list()).json()).toMatchObject({ data: { items: [], total: 0 } });
      expect(await readdir(join(root, 'private'))).toEqual([]);
    }
    const accepted = await upload(await readerFixture(textParagraph(languageSamples.french)));
    expect(accepted.status).toBe(201);
    expect(await (await list()).json()).toMatchObject({ data: { total: 1 } });
  });

  it('accepts the formerly rejected content-control and tracked-change fixtures and stores their originals', async () => {
    for (const name of ['content-control', 'tracked-changes']) {
      const bytes = await readFile(join(__dirname, `../../shared/testing/fixtures/docx/${name}.docx`));
      const response = await upload(bytes, `${name}.docx`);
      expect(response.status).toBe(201);
      const { data } = await response.json();
      const original = await download(data.id);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
    }
    expect(await (await list()).json()).toMatchObject({ data: { total: 2 } });
  });

  it('accepts exactly 10 MB and rejects one byte over without storage', async () => {
    const accepted = await upload(await docxFixture({}, 10000000));
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({ data: { size: 10000000 } });
    const before = await readdir(join(root, 'private'));
    const rejected = await upload(await docxFixture({}, 10000001));
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toMatchObject({ message: expect.stringContaining('10 MB') });
    expect(await readdir(join(root, 'private'))).toEqual(before);
    expect(await (await list()).json()).toMatchObject({ data: { total: 1 } });
  });

  it('returns the same 404 for another user, the admin, an unknown ID and an invalid ID', async () => {
    const { data } = await (await upload(await docxFixture())).json();
    const missing = await download(randomUUID());
    const missingBody = await missing.json();
    expect(missing.status).toBe(404);
    for (const identity of ['other', 'admin']) {
      expect(await (await list(identity)).json()).toMatchObject({ data: { items: [], total: 0 } });
      const denied = await download(data.id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missingBody);
    }
    expect((await download('invalid')).status).toBe(404);
  });

  it('returns 401 for every signed-out document endpoint and stores nothing', async () => {
    expect((await upload(await docxFixture(), 'essay.docx', '')).status).toBe(401);
    expect((await list('')).status).toBe(401);
    expect((await download(randomUUID(), '')).status).toBe(401);
    expect(await readdir(join(root, 'private'))).toEqual([]);
  });

  it('paginates newest first and does not let a query parameter select another owner', async () => {
    for (let i = 1; i <= 3; i++) {
      await upload(await docxFixture(), `essay-${i}.docx`);
      records.at(-1).createdAt = new Date(`2026-01-0${i}T00:00:00Z`);
    }
    await upload(await docxFixture(), 'someone-else.docx', 'other');
    const first = await (await list('owner', '?pageSize=2&ownerId=other')).json();
    expect(first.data.items.map((item) => item.filename)).toEqual(['essay-3.docx', 'essay-2.docx']);
    expect(first.data).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    const second = await (await list('owner', '?page=2&pageSize=2')).json();
    expect(second.data.items.map((item) => item.filename)).toEqual(['essay-1.docx']);
    for (const query of ['?page=0', '?pageSize=51', '?page=1.5', '?page=letters'])
      expect((await list('owner', query)).status).toBe(400);
  });

  it('uses generated disk names and safe names for metadata and downloads', async () => {
    const { data } = await (await upload(await docxFixture(), 'résumé";bad.exe')).json();
    expect(data.filename).toBe('résumé_bad.docx');
    const original = await download(data.id);
    expect(original.headers.get('content-disposition')).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9_bad.docx");
    const files = await readdir(join(root, 'private'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}\.docx$/);
    expect(files[0]).not.toBe(data.filename);
  });

  it('removes private bytes when the database insert fails before committing', async () => {
    databaseFailure = 'save';
    expect((await upload(await docxFixture())).status).toBe(503);
    expect(await (await list()).json()).toMatchObject({ data: { total: 0 } });
    expect(await readdir(join(root, 'private'))).toEqual([]);
  });

  it('keeps a committed original intact if the commit acknowledgement is lost', async () => {
    databaseFailure = 'acknowledgement';
    const bytes = await docxFixture();
    expect((await upload(bytes)).status).toBe(503);
    databaseFailure = '';
    const { data } = await (await list()).json();
    expect(data.total).toBe(1);
    expect(Buffer.from(await (await download(data.items[0].id)).arrayBuffer())).toEqual(bytes);
  });

  it.each(['commit', 'unavailable'])('leaves uncertain files inaccessible after a %s failure', async (failure) => {
    databaseFailure = failure;
    expect((await upload(await docxFixture())).status).toBe(503);
    databaseFailure = '';
    expect(await (await list()).json()).toMatchObject({ data: { total: 0 } });
    const [key] = await readdir(join(root, 'private'));
    expect((await download(key)).status).toBe(404);
    expect((await fetch(`${base}/uploads/${key}`)).status).toBe(404);
  });

  it('does not publish a record if the filesystem write fails', async () => {
    await rm(join(root, 'private'), { recursive: true });
    await writeFile(join(root, 'private'), 'unavailable directory');
    expect((await upload(await docxFixture())).status).toBe(503);
    expect(await (await list()).json()).toMatchObject({ data: { total: 0 } });
  });

  it('rejects unsafe or corrupt DOCX packages before persistence', async () => {
    const valid = await docxFixture();
    const corrupt = Buffer.from(valid);
    corrupt[corrupt.indexOf('Private student text.')] = 88;
    const traversal = Buffer.from(
      valid.toString('binary').replaceAll('word/document.xml', '../x/document.xml'),
      'binary'
    );
    const fixtures = [
      corrupt,
      traversal,
      valid.subarray(0, valid.length - 12),
      await docxFixture({
        'word/document.xml': '<!DOCTYPE doc [<!ENTITY secret SYSTEM "file:///etc/passwd">]><doc>&secret;</doc>'
      }),
      await docxFixture({
        'word/document.xml':
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:document>'
      }),
      await docxFixture({
        '_rels/.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.com/secret" TargetMode="External"/></Relationships>'
      }),
      await docxFixture({
        '[Content_Types].xml':
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>'
      })
    ];
    for (const bytes of fixtures) expect((await upload(bytes)).status).toBe(400);
    expect(vi.mocked(Logger.prototype.error)).not.toHaveBeenCalled();
    expect(await readdir(join(root, 'private'))).toEqual([]);
    expect(await (await list()).json()).toMatchObject({ data: { total: 0 } });
  });

  it('serves public uploads without exposing private originals by any storage path', async () => {
    const { data } = await (await upload(await docxFixture())).json();
    const [key] = await readdir(join(root, 'private'));
    await writeFile(join(root, 'public', 'profile.txt'), 'public avatar placeholder');
    expect((await fetch(`${base}/uploads/profile.txt`)).status).toBe(200);
    expect((await fetch(`${base}/documents/${key}`)).status).toBe(401);
    expect((await fetch(`${base}/documents/${key}`, { headers: { 'test-identity': 'owner' } })).status).toBe(404);
    for (const path of [
      `/uploads/${key}`,
      `/uploads/${data.id}`,
      `/private-documents/${key}`,
      `/uploads/%2e%2e%2fprivate%2f${key}`
    ]) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
  });

  it('does not expose document filenames or contents through admin users, statistics or CSV', async () => {
    const paths = ['/users', '/users/alice@example.com', '/users/export/csv', '/stats'];
    const responses = async () =>
      Promise.all(
        paths.map(async (path) => {
          const response = await fetch(`${base}${path}`, { headers: { 'test-identity': 'admin' } });
          expect(response.status).toBe(200);
          return response.text();
        })
      );
    const before = await responses();
    await upload(await docxFixture(), 'confidential-thesis.docx');
    const after = await responses();
    expect(after).toEqual(before);
    expect(after.join('')).not.toContain('confidential-thesis');
    expect(after.join('')).not.toContain('Private student text.');
  });

  it('rejects compressed expansion and excessive XML nesting before storage', async () => {
    const huge = await docxFixture({ 'word/huge.bin': Buffer.alloc(20000001) }, undefined, true);
    expect(huge.length).toBeLessThan(10000000);
    const nested = await docxFixture({ 'word/document.xml': '<x>'.repeat(129) + '</x>'.repeat(129) });
    for (const bytes of [huge, nested]) expect((await upload(bytes)).status).toBe(400);
    expect(await readdir(join(root, 'private'))).toEqual([]);
  });

  it('accepts compressed DOCX content regardless of the supplied extension or MIME type', async () => {
    const bytes = await docxFixture({}, undefined, true);
    const response = await upload(bytes, 'renamed.zip');
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.filename).toBe('renamed.docx');
    expect(Buffer.from(await (await download(data.id)).arrayBuffer())).toEqual(bytes);
  });

  it('rejects missing files, extra multipart fields and multiple files without persistence', async () => {
    for (const kind of ['missing', 'field', 'multiple']) {
      const body = new FormData();
      if (kind !== 'missing') body.append('file', new Blob([new Uint8Array(await docxFixture())]), 'one.docx');
      if (kind === 'field') body.append('ownerId', 'another-owner');
      if (kind === 'multiple') body.append('file', new Blob([new Uint8Array(await docxFixture())]), 'two.docx');
      const response = await fetch(`${base}/documents`, {
        method: 'POST',
        headers: { 'test-identity': 'owner' },
        body
      });
      expect(response.status).toBe(400);
    }
    expect(await readdir(join(root, 'private'))).toEqual([]);
  });
  it('retains original bytes when a lost commit connection settles after an empty lookup', async () => {
    databaseFailure = 'late-commit';
    const bytes = await docxFixture();
    expect((await upload(bytes)).status).toBe(503);
    expect(await (await list()).json()).toMatchObject({ data: { total: 0 } });
    settleCommit();
    databaseFailure = '';
    const { data } = await (await list()).json();
    expect(data.total).toBe(1);
    expect(Buffer.from(await (await download(data.items[0].id)).arrayBuffer())).toEqual(bytes);
  });
  it('offers distinct owner-only original and validated revised downloads', async () => {
    const original = await readerFixture(textParagraph('In order to study the river.'));
    const revised = await readerFixture(textParagraph('To study the river.'));
    const { data } = await (await upload(original)).json();
    const get = (id: string, identity = 'owner') =>
      fetch(`${base}/documents/${id}/revised`, { headers: identity ? { 'test-identity': identity } : {} });
    expect((await get(data.id)).status).toBe(404);
    const key = `${randomUUID()}.docx`;
    await app.get(DocumentStorage).write(key, revised);
    Object.assign(records[0], {
      status: 'completed',
      phase: 'rewrite',
      strength: 50,
      revisedKey: key,
      revisedSize: revised.length,
      assessment,
      finalAssessment: styleAssessmentFixture(10)
    });
    const response = await get(data.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toContain('revised-essay.docx');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(revised);
    expect(Buffer.from(await (await download(data.id)).arrayBuffer())).toEqual(original);
    const missing = await (await get(randomUUID())).json();
    for (const identity of ['other', 'admin']) {
      const denied = await get(data.id, identity);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(missing);
    }
    expect(await (await get('invalid')).json()).toEqual(missing);
    expect((await get(data.id, '')).status).toBe(401);
    for (const path of [`/uploads/${key}`, `/private-documents/${key}`])
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    Object.assign(records[0], { status: 'failed', failureCode: 'citation', revisedKey: null, revisedSize: null });
    expect((await get(data.id)).status).toBe(404);
    expect(Buffer.from(await (await download(data.id)).arrayBuffer())).toEqual(original);
    const detail = await fetch(`${base}/documents/${data.id}`, { headers: { 'test-identity': 'owner' } });
    expect(await detail.json()).toMatchObject({
      data: {
        status: 'failed',
        phase: 'rewrite',
        strength: 50,
        assessment: { rubric: assessment.rubric, style: assessment.style },
        finalAssessment: null,
        finalScoreUnavailable: false,
        failure: expect.stringContaining('citation')
      }
    });
    expect(JSON.stringify(await (await list()).json())).not.toContain(key);
  });
});
