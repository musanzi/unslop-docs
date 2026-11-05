import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { of } from 'rxjs';
import { IAllowanceResponse, IDocumentAssessmentResponse } from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { Media } from '@web/core/media';
import { DocumentsStore } from '../../data-access/documents.store';
import { Workspace } from './workspace';
import { User } from '@web/shared/ui/user/user';

const document: IDocumentAssessmentResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  filename: 'river.docx',
  size: 1234,
  createdAt: '2026-11-05T12:00:00Z',
  status: 'completed',
  processingStage: null,
  failure: null,
  assessment: { patterns: [] }
};

afterEach(() => TestBed.resetTestingModule());

describe('Retry from document history', () => {
  function element<T extends Element = Element>(root: ParentNode, selector: string): T {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing workspace element: ${selector}`);
    return found;
  }

  const failed: IDocumentAssessmentResponse = {
    ...document,
    status: 'failed',
    assessment: null,
    failure: 'Processing failed. Your original is still available.'
  };
  const allowance: IAllowanceResponse = {
    status: 'FREE',
    limit: 3,
    used: 0,
    reserved: 0,
    remaining: 3,
    month: '2026-11',
    resetsAt: '2026-12-01T00:00:00Z'
  };
  async function render(detail = failed) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: {
            user: signal(null),
            isAdmin: () => false,
            signOut: vi.fn(),
            isSigningOut: signal(false),
            signOutError: signal('')
          }
        },
        { provide: Media, useValue: { match: () => signal(false) } }
      ]
    });
    TestBed.overrideComponent(User, {
      set: {
        template: readFileSync(`${import.meta.dirname}/../../../../../../shared/ui/user/user.html`, 'utf8'),
        templateUrl: undefined
      }
    });
    TestBed.overrideComponent(Workspace, {
      set: {
        template: readFileSync(`${import.meta.dirname}/workspace.html`, 'utf8'),
        templateUrl: undefined
      }
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockImplementation(() =>
      of(globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    );
    const fixture = TestBed.createComponent(Workspace);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [detail], page: 1, pageSize: 20, total: 1 });
    http.expectOne('/documents/allowance').flush(allowance);
    await fixture.whenStable();
    return { fixture, http, page: fixture.nativeElement as HTMLElement };
  }

  it('shows a retry action on a failed sidebar entry', async () => {
    const { page, http } = await render();
    const history = element(page, 'nav[aria-label="Document history"]');
    expect(history.querySelector<HTMLButtonElement>('button[aria-label="Retry river.docx"]')).not.toBeNull();
    http.verify();
  });

  it.each(['stored', 'queued', 'processing', 'assessed', 'completed'] as const)(
    'hides retry for a %s entry',
    async (status) => {
      const { page, http } = await render({ ...document, status });
      expect(page.querySelector('button[aria-label="Retry river.docx"]')).toBeNull();
      http.verify();
    }
  );

  it('sends one retry for a double click and replaces the failed entry with queued progress', async () => {
    const { page, http, fixture } = await render();
    const retry = element<HTMLButtonElement>(page, 'button[aria-label="Retry river.docx"]');
    retry.click();
    retry.click();
    await fixture.whenStable();
    expect(retry.disabled).toBe(true);
    expect(retry.textContent).toContain('Retrying');
    const request = http.expectOne(`/documents/${document.id}/retry`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    const queued = { ...failed, status: 'queued', failure: null };
    request.flush(queued);
    http.expectOne('/documents/allowance').flush({ ...allowance, reserved: 1, remaining: 2 });
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [queued], page: 1, pageSize: 20, total: 1 });
    await fixture.whenStable();
    expect(page.querySelector('button[aria-label="Retry river.docx"]')).toBeNull();
    expect(element(page, 'nav[aria-label="Document history"]').textContent).toContain('Queued');
    expect(page.textContent).toContain('1 reserved');
    http.verify();
  });

  it('keeps a refused retry failed and displays the server allowance explanation', async () => {
    const { page, http, fixture } = await render();
    element<HTMLButtonElement>(page, 'button[aria-label="Retry river.docx"]').click();
    const message =
      'Your FREE allowance of 3 documents is fully used or reserved. It resets on 2026-12-01T00:00:00.000Z (UTC).';
    http.expectOne(`/documents/${document.id}/retry`).flush({ message }, { status: 409, statusText: 'Conflict' });
    http.expectOne('/documents/allowance').flush({ ...allowance, used: 3, remaining: 0 });
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [failed], page: 1, pageSize: 20, total: 1 });
    await fixture.whenStable();
    expect(element(page, 'nav[aria-label="Document history"]').textContent).toContain('Failed');
    expect(element(page, '[role="alert"]').textContent).toContain(message);
    expect(element<HTMLButtonElement>(page, 'button[aria-label="Retry river.docx"]').disabled).toBe(false);
    http.verify();
  });

  it('refreshes the selected document after retry and ignores an older failure response', async () => {
    const { page, http, fixture } = await render();
    element<HTMLButtonElement>(page, 'nav[aria-label="Document history"] button').click();
    const oldDetail = http.expectOne(`/documents/${document.id}`);
    element<HTMLButtonElement>(page, 'button[aria-label="Retry river.docx"]').click();
    const queued = { ...failed, status: 'queued', failure: null };
    http.expectOne(`/documents/${document.id}/retry`).flush(queued);
    http.expectOne(`/documents/${document.id}`).flush(queued);
    http.expectOne('/documents/allowance').flush({ ...allowance, reserved: 1, remaining: 2 });
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [queued], page: 1, pageSize: 20, total: 1 });
    oldDetail.flush(failed);
    await fixture.whenStable();
    expect(page.textContent).not.toContain(failed.failure);
    expect(page.querySelector('main')?.textContent).toContain('Queued');
    expect(page.querySelector('button[aria-label="Retry river.docx"]')).toBeNull();
    http.verify();
  });

  it('refreshes history after an uncertain response so an accepted retry no longer appears failed', async () => {
    const { page, http, fixture } = await render();
    element<HTMLButtonElement>(page, 'button[aria-label="Retry river.docx"]').click();
    http.expectOne(`/documents/${document.id}/retry`).flush({}, { status: 503, statusText: 'Service unavailable' });
    http.expectOne('/documents/allowance').flush({ ...allowance, reserved: 1, remaining: 2 });
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [{ ...failed, status: 'processing', failure: null }], page: 1, pageSize: 20, total: 1 });
    await fixture.whenStable();
    expect(page.querySelector('button[aria-label="Retry river.docx"]')).toBeNull();
    expect(element(page, '[role="alert"]').textContent).toContain('Refresh your history');
    expect(element(page, 'nav[aria-label="Document history"]').textContent).toContain('Processing');
    http.verify();
  });
});

describe('Document workspace results', () => {
  async function render(
    detail: IDocumentAssessmentResponse,
    allowance: IAllowanceResponse = {
      status: 'FREE',
      limit: 3,
      used: 1,
      reserved: 1,
      remaining: 1,
      month: '2026-11',
      resetsAt: '2026-12-01T00:00:00.000Z'
    }
  ) {
    const store = {
      start: vi.fn(),
      allowance: signal(allowance),
      allowanceError: signal(''),
      allowanceBlocked: () => allowance.remaining === 0,
      page: signal(1),
      pageCount: signal(1),
      loading: signal(false),
      total: signal(1),
      items: signal([detail]),
      selected: signal(detail),
      detail: signal(detail),
      detailLoading: signal(false),
      detailError: signal(''),
      listError: signal(''),
      uploadError: signal(''),
      downloadError: signal(''),
      uploading: signal(false),
      retrying: signal(null),
      retryError: signal(null),
      downloading: signal(false),
      announcement: signal(''),
      progress: (item: IDocumentAssessmentResponse) => (item.status === 'completed' ? 'Completed' : 'Failed')
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: AuthStore,
          useValue: {
            user: signal(null),
            isAdmin: () => false,
            signOut: vi.fn(),
            isSigningOut: signal(false),
            signOutError: signal('')
          }
        },
        { provide: Media, useValue: { match: () => signal(false) } }
      ]
    });
    TestBed.overrideComponent(User, {
      set: {
        template: readFileSync(`${import.meta.dirname}/../../../../../../shared/ui/user/user.html`, 'utf8'),
        templateUrl: undefined
      }
    });
    TestBed.overrideComponent(Workspace, {
      set: {
        template: readFileSync(`${import.meta.dirname}/workspace.html`, 'utf8'),
        templateUrl: undefined,
        providers: [{ provide: DocumentsStore, useValue: store }]
      }
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockImplementation(() => {
      return of(globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    });
    const fixture = TestBed.createComponent(Workspace);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows used documents, active reservations, remaining allowance and a UTC reset date', async () => {
    const page = await render(document);
    expect(page.textContent).toContain('1 used');
    expect(page.textContent).toContain('1 reserved');
    expect(page.textContent).toContain('1 remaining');
    expect(page.textContent).toContain('FREE · 3 documents');
    expect(page.textContent).toContain('Dec 1, 2026');
    expect(page.textContent).toContain('00:00 UTC');
  });

  it('explains a full allowance and disables uploads while preserving downloads', async () => {
    const page = await render(document, {
      status: 'FREE',
      limit: 3,
      used: 2,
      reserved: 1,
      remaining: 0,
      month: '2026-12',
      resetsAt: '2027-01-01T00:00:00.000Z'
    });
    expect(page.textContent).toContain('Monthly allowance reached');
    expect(page.textContent).toContain('Jan 1, 2027');
    const buttons = [...page.querySelectorAll('button')];
    expect(buttons.find((button) => button.textContent.includes('Upload DOCX'))?.disabled).toBe(true);
    expect(buttons.find((button) => button.textContent.includes('Download original'))?.disabled).toBe(false);
  });

  it('shows both downloads and a review reminder for a completed no-pattern document', async () => {
    const page = await render(document);
    expect(page.textContent).toContain('Completed');
    expect(page.textContent).toContain('No writing patterns found');
    expect(page.textContent).toContain('do not prove unchanged meaning');
    const buttons = [...page.querySelectorAll('button')].map((button) => button.textContent.trim());
    expect(buttons).toContain('Download original');
    expect(buttons).toContain('Download revised DOCX');
    expect(page.querySelector('textarea')).toBeNull();
  });

  it('shows an actionable failure and only the original download', async () => {
    const page = await render({
      ...document,
      status: 'failed',
      assessment: null,
      failure: 'The edit changed a citation. Keep citations as plain, complete text and upload again.'
    });
    expect(page.textContent).toContain('The edit changed a citation');
    expect(page.textContent).toContain('Download original');
    expect(page.textContent).not.toContain('Download revised DOCX');
  });
});

describe('Private document downloads', () => {
  it('requests each version through its own private endpoint', async () => {
    TestBed.configureTestingModule({
      providers: [
        DocumentsStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStore, useValue: { setUser: vi.fn() } }
      ]
    });
    const store = TestBed.inject(DocumentsStore);
    const http = TestBed.inject(HttpTestingController);
    for (const version of ['original', 'revised'] as const) {
      const download = store.download(document, version);
      const request = http.expectOne(`/documents/${document.id}/${version}`);
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob([version]));
      expect(await download).toBeInstanceOf(Blob);
    }
    expect(store.progress({ ...document, status: 'processing', processingStage: 'editing' })).toBe(
      'Editing your document'
    );
    expect(store.progress({ ...document, status: 'processing', processingStage: 'validating' })).toBe(
      'Checking the revised document'
    );
    http.verify();
  });
});

describe('Workspace allowance HTTP state', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        DocumentsStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStore, useValue: { setUser: vi.fn() } }
      ]
    });
    return { store: TestBed.inject(DocumentsStore), http: TestBed.inject(HttpTestingController) };
  }

  it('refreshes allowance on history polling, including an upgrade and a UTC month reset', () => {
    const { store, http } = setup();
    const statuses: IAllowanceResponse[] = [
      {
        status: 'FREE',
        limit: 3,
        used: 3,
        reserved: 0,
        remaining: 0,
        month: '2026-12',
        resetsAt: '2027-01-01T00:00:00Z'
      },
      {
        status: 'PREMIUM',
        limit: 15,
        used: 3,
        reserved: 0,
        remaining: 12,
        month: '2026-12',
        resetsAt: '2027-01-01T00:00:00Z'
      },
      {
        status: 'PREMIUM',
        limit: 15,
        used: 0,
        reserved: 0,
        remaining: 15,
        month: '2027-01',
        resetsAt: '2027-02-01T00:00:00Z'
      }
    ];
    for (const allowance of statuses) {
      store.load(1, true);
      http.expectOne((request) => request.url === '/documents').flush({ items: [], total: 0, page: 1 });
      const request = http.expectOne('/documents/allowance');
      expect(request.request.transferCache).toBe(false);
      request.flush(allowance);
      expect(store.allowance()).toEqual(allowance);
      expect(store.allowanceBlocked()).toBe(allowance.remaining === 0);
    }
    http.verify();
  });

  it('retains the server limit/reset explanation after a competing upload takes the last slot', () => {
    const { store, http } = setup();
    store.upload(new File(['fixture'], 'fixture.docx'));
    http.expectOne('/documents').flush(
      {
        message:
          'Your FREE allowance of 3 documents is fully used or reserved. It resets on 2027-01-01T00:00:00.000Z (UTC).'
      },
      { status: 409, statusText: 'Conflict' }
    );
    expect(store.uploadError()).toContain('3 documents');
    expect(store.uploadError()).toContain('2027-01-01');
    http.expectOne('/documents/allowance').flush({
      status: 'FREE',
      limit: 3,
      used: 2,
      reserved: 1,
      remaining: 0,
      month: '2026-12',
      resetsAt: '2027-01-01T00:00:00Z'
    });
    expect(store.allowanceBlocked()).toBe(true);
    expect(store.items()).toEqual([]);
    expect(store.uploading()).toBe(false);
    http.verify();
  });
});
