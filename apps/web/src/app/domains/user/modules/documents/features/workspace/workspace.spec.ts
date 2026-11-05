import { TestBed } from '@angular/core/testing';
import { Input, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { of } from 'rxjs';
import {
  IAllowanceResponse,
  IDocumentAssessmentResponse,
  IPreviewBlockResponse,
  IUserResponse
} from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { Media } from '@web/core/media';
import { DocumentsStore } from '../../data-access/documents.store';
import { Workspace } from './workspace';
import { User } from '@web/shared/ui/user/user';
import { testUser } from '@web/shared/testing/user-fixture';
import { MatDialog } from '@angular/material/dialog';
import DeleteDocument from '../delete-document/delete-document';

// Vitest uses JIT without Angular's signal-input metadata transform.
const subscriptionInput = { alias: 'subscriptionStatus', isSignal: true };
Input(subscriptionInput)(User.prototype, 'subscriptionStatus');

const document: IDocumentAssessmentResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  filename: 'river.docx',
  size: 1234,
  createdAt: '2026-11-05T12:00:00Z',
  status: 'completed',
  phase: 'rewrite',
  processingStage: null,
  progress: null,
  strength: 50,
  failure: null,
  assessment: { rubric: null, score: null, patterns: [] },
  finalAssessment: null,
  finalScoreUnavailable: true,
  revisionNotices: null
};

afterEach(() => TestBed.resetTestingModule());

function flushPreview(http: HttpTestingController, blocks: IPreviewBlockResponse[] = []) {
  http.expectOne(`/documents/${document.id}/preview`).flush({ blocks });
}

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
    expect(fixture.debugElement.injector.get(DocumentsStore).allowance()?.reserved).toBe(1);
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

describe('Delete from document history', () => {
  function element<T extends Element = Element>(root: ParentNode, selector: string): T {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing workspace element: ${selector}`);
    return found;
  }
  const allowance: IAllowanceResponse = {
    status: 'FREE',
    limit: 3,
    used: 1,
    reserved: 0,
    remaining: 2,
    month: '2026-11',
    resetsAt: '2026-12-01T00:00:00Z'
  };
  const other: IDocumentAssessmentResponse = {
    ...document,
    id: '00000000-0000-4000-8000-000000000002',
    filename: 'lake.docx'
  };
  async function render(items: IDocumentAssessmentResponse[] = [document, other]) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: {
            user: signal(testUser),
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
    TestBed.overrideComponent(DeleteDocument, {
      set: {
        template: readFileSync(`${import.meta.dirname}/../delete-document/delete-document.html`, 'utf8'),
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
      .flush({ items, page: 1, pageSize: 20, total: items.length });
    http.expectOne('/documents/allowance').flush(allowance);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const trigger = element<HTMLButtonElement>(page, 'button[aria-label="Delete river.docx"]');
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    const modal = element(globalThis.document, '[role="dialog"]');
    const confirm = [...modal.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Delete')!;
    return { fixture, http, page, trigger, modal, confirm, dialog: TestBed.inject(MatDialog) };
  }
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('confirms with the document name and warns that deletion cannot be undone before cancelling', async () => {
    const { http, trigger, modal, dialog } = await render();
    expect(modal.getAttribute('aria-labelledby')).toBe('delete-document-heading');
    expect(element(modal, '#delete-document-heading').textContent).toContain('river.docx');
    expect(modal.textContent).toContain('cannot be undone');
    [...modal.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Cancel')!.click();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    expect(globalThis.document.activeElement).toBe(trigger);
    http.expectNone((request) => request.method === 'DELETE');
    http.verify();
  });

  it('sends one delete for a double confirm, removes the entry, clears the selection and moves focus', async () => {
    const { fixture, http, page, confirm, dialog } = await render();
    const entry = element<HTMLButtonElement>(page, 'nav[aria-label="Document history"] button');
    entry.click();
    http.expectOne(`/documents/${document.id}`).flush(document);
    flushPreview(http);
    await fixture.whenStable();
    expect(page.querySelector('main h1')?.textContent).toContain('river.docx');
    confirm.click();
    confirm.click();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    await fixture.whenStable();
    const request = http.expectOne(`/documents/${document.id}`);
    expect(request.request.method).toBe('DELETE');
    expect(element<HTMLButtonElement>(page, 'button[aria-label="Delete lake.docx"]').disabled).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    http.expectOne('/documents/allowance').flush(allowance);
    http
      .expectOne((request) => request.url === '/documents')
      .flush({ items: [other], page: 1, pageSize: 20, total: 1 });
    await fixture.whenStable();
    expect(page.querySelector('button[aria-label="Delete river.docx"]')).toBeNull();
    expect(element(page, 'nav[aria-label="Document history"]').textContent).not.toContain('river.docx');
    expect(page.querySelector('main h1')?.textContent).toContain('Welcome');
    expect(page.querySelector('[role="status"]')?.textContent ?? page.textContent).toContain('river.docx deleted.');
    expect(globalThis.document.activeElement?.textContent).toContain('New document');
    expect(element<HTMLButtonElement>(page, 'button[aria-label="Delete lake.docx"]').disabled).toBe(false);
    http.verify();
  });

  it('shows the empty state after the last entry is deleted and treats an already deleted document as gone', async () => {
    const { fixture, http, page, confirm, dialog } = await render([document]);
    confirm.click();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    await fixture.whenStable();
    http
      .expectOne((request) => request.method === 'DELETE')
      .flush({ message: 'Document not found.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    http.expectOne('/documents/allowance').flush(allowance);
    http.expectOne((request) => request.url === '/documents').flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await fixture.whenStable();
    expect(element(page, 'nav[aria-label="Document history"]').textContent).toContain('Your uploads appear here.');
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(globalThis.document.activeElement?.textContent).toContain('New document');
    http.verify();
  });

  it('keeps a refused entry and shows the server explanation beside it', async () => {
    const { fixture, http, page, trigger, confirm, dialog } = await render();
    confirm.click();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    await fixture.whenStable();
    const message = 'This document is still being processed. Wait until it finishes or fails before deleting it.';
    http
      .expectOne((request) => request.method === 'DELETE')
      .flush({ message }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.querySelector('[role="alert"]')?.textContent).toContain(message));
    expect(element(page, 'nav[aria-label="Document history"]').textContent).toContain('river.docx');
    expect(trigger.disabled).toBe(false);
    expect(globalThis.document.activeElement).toBe(trigger);
    http.verify();
  });
});

describe('Document workspace results', () => {
  async function render(
    detail: IDocumentAssessmentResponse | null,
    allowance: IAllowanceResponse = {
      status: 'FREE',
      limit: 3,
      used: 1,
      reserved: 1,
      remaining: 1,
      month: '2026-11',
      resetsAt: '2026-12-01T00:00:00.000Z'
    },
    user: IUserResponse | null = testUser
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
      items: signal(detail ? [detail] : []),
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
      deleting: signal(null),
      deleteError: signal(null),
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
            user: signal(user),
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

  it('welcomes the user with their plan and a WhatsApp contact, without usage or provider copy', async () => {
    const page = await render(null);
    expect(page.querySelector('h1')?.textContent).toContain('Welcome, Alice.');
    expect(page.textContent).toContain('Your current plan is Free.');
    expect(page.textContent).not.toMatch(/1 used|1 reserved|1 remaining|Resets|DeepSeek|stay private/);
    const contact = page.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(contact?.textContent).toContain('Contact Musanzi on WhatsApp');
    expect(new URL(contact?.href ?? '').pathname).toBe('/243832878704');
    expect(new URL(contact?.href ?? '').searchParams.get('text')).toContain('Hi Musanzi');
    expect(page.querySelector('details')?.open).toBe(false);
    expect(page.querySelector('summary')?.textContent).toContain('View plans');
    const plans = page.querySelector('section[aria-label="Subscription plans"]');
    expect(plans?.textContent).toMatch(/Free\s*3 documents \/ month\s+\$0/);
    expect(plans?.textContent).toMatch(/Premium\s*15 documents \/ month\s+\$7/);
    expect(plans?.textContent).toMatch(/Gold\s*35 documents \/ month\s+\$15/);
    for (const plan of ['Premium', 'Gold']) {
      const link = plans?.querySelector<HTMLAnchorElement>(`a[aria-label="Upgrade to ${plan} on WhatsApp"]`);
      const url = new URL(link?.href ?? '');
      expect(url.pathname).toBe('/243832878704');
      expect(url.searchParams.get('text')).toContain(`upgrade my Unslopy subscription to ${plan}`);
    }
  });

  it.each([
    ['FREE', 'Free', 'leaf', 2],
    ['PREMIUM', 'Premium', 'badge-check', 1],
    ['GOLD', 'Gold', 'crown', 0]
  ] as const)(
    'shows the current %s plan in the sidebar and offers only upgrades',
    async (status, name, icon, upgrades) => {
      const page = await render(null, {
        status,
        limit: 35,
        used: 0,
        reserved: 0,
        remaining: 35,
        month: '2026-11',
        resetsAt: '2026-12-01T00:00:00Z'
      });
      expect(page.textContent).toContain(`Your current plan is ${name}.`);
      const badge = page.querySelector(`user [aria-label="${name} subscription"]`);
      expect(badge?.textContent).toContain(name);
      expect(badge?.querySelector('mat-icon')?.getAttribute('data-mat-icon-name')).toBe(icon);
      expect(page.querySelectorAll('section[aria-label="Subscription plans"] a')).toHaveLength(upgrades);
    }
  );

  it('uses a welcome without a name while user data is unavailable', async () => {
    const page = await render(null, undefined, null);
    expect(page.querySelector('h1')?.textContent).toContain('Welcome back.');
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
    expect(page.textContent).toContain('Your monthly document limit is reached');
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

describe('Document phases', () => {
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
    return TestBed.inject(DocumentsStore);
  }

  it.each([
    [{ status: 'queued', phase: 'assessment' }, 'queued', 'Queued for assessment'],
    [{ status: 'processing', phase: 'assessment', processingStage: 'assessing' }, 'assessing', 'Assessing writing'],
    [{ status: 'processing', phase: 'assessment' }, 'assessing', 'Processing'],
    [{ status: 'assessed', phase: 'assessment' }, 'ready-to-edit', 'Ready to edit'],
    [{ status: 'queued', phase: 'rewrite' }, 'queued', 'Queued for editing'],
    [{ status: 'processing', phase: 'rewrite', processingStage: 'editing' }, 'editing', 'Editing your document'],
    [
      { status: 'processing', phase: 'rewrite', processingStage: 'validating' },
      'checking-result',
      'Checking the revised document'
    ],
    [
      { status: 'processing', phase: 'rewrite', processingStage: 'final-assessment' },
      'checking-result',
      'Assessing the revised document'
    ],
    [{ status: 'completed', phase: 'rewrite' }, 'download-ready', 'Download ready'],
    [{ status: 'failed', phase: 'assessment' }, 'failed', 'Failed'],
    [{ status: 'stored', phase: 'assessment' }, 'stored', 'Original saved']
  ] as const)('names the phase of %o', (fields, key, label) => {
    const store = setup();
    const phase = store.phase({ ...document, processingStage: null, ...fields });
    expect(phase.key).toBe(key);
    expect(phase.label).toBe(label);
    expect(store.progress({ ...document, processingStage: null, ...fields })).toBe(label);
  });
});

describe('Phase changes while watching', () => {
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
  const queued: IDocumentAssessmentResponse = { ...document, status: 'queued', phase: 'assessment', assessment: null };

  it('announces each phase change once and celebrates only a completion it watched', () => {
    const { store, http } = setup();
    store.select(queued);
    http.expectOne(`/documents/${document.id}`).flush(queued);
    expect(store.phaseAnnouncement()).toBe('');
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush({ ...queued, status: 'processing', processingStage: 'assessing' });
    expect(store.phaseAnnouncement()).toBe('river.docx: Assessing writing.');
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush({ ...queued, status: 'processing', processingStage: 'assessing' });
    expect(store.phaseAnnouncement()).toBe('river.docx: Assessing writing.');
    expect(store.celebrating()).toBeNull();
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush({ ...document, status: 'completed' });
    flushPreview(http);
    expect(store.phaseAnnouncement()).toBe('river.docx: Download ready.');
    expect(store.celebrating()).toBe(document.id);
    store.select(null);
    store.select(document);
    http.expectOne(`/documents/${document.id}`).flush(document);
    flushPreview(http);
    expect(store.celebrating()).toBeNull();
    http.verify();
  });

  it('does not celebrate a document that was already complete when loaded or opened', () => {
    const { store, http } = setup();
    store.load(1);
    http.expectOne((request) => request.url === '/documents').flush({ items: [document], page: 1, pageSize: 20, total: 1 });
    http.expectOne('/documents/allowance').flush({});
    store.select(document);
    http.expectOne(`/documents/${document.id}`).flush(document);
    flushPreview(http);
    expect(store.celebrating()).toBeNull();
    expect(store.phaseAnnouncement()).toBe('');
    http.verify();
  });

  it('observes a completion through history polling while the document is selected', () => {
    const { store, http } = setup();
    const editing = { ...document, status: 'processing', phase: 'rewrite', processingStage: 'editing' } as const;
    store.load(1);
    http.expectOne((request) => request.url === '/documents').flush({ items: [editing], page: 1, pageSize: 20, total: 1 });
    http.expectOne('/documents/allowance').flush({});
    store.select(editing);
    http.expectOne(`/documents/${document.id}`).flush(editing);
    flushPreview(http);
    store.load(1, true);
    http.expectOne((request) => request.url === '/documents').flush({ items: [document], page: 1, pageSize: 20, total: 1 });
    http.expectOne('/documents/allowance').flush({});
    expect(store.celebrating()).toBe(document.id);
    expect(store.phaseAnnouncement()).toBe('river.docx: Download ready.');
    http.verify();
  });
});

describe('Upload progress', () => {
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

  it('reports transferred bytes, falls back to indeterminate, and hands over to assessment without claiming completion', () => {
    const { store, http } = setup();
    store.upload(new File(['fixture'], 'river.docx'));
    const request = http.expectOne('/documents');
    expect(request.request.reportProgress).toBe(true);
    expect(store.uploadProgress()).toBeNull();
    request.event({ type: HttpEventType.UploadProgress, loaded: 300, total: 1200 });
    expect(store.uploadProgress()).toEqual({ loaded: 300, total: 1200, percent: 25 });
    request.event({ type: HttpEventType.UploadProgress, loaded: 600 });
    expect(store.uploadProgress()).toEqual({ loaded: 600, total: null, percent: null });
    const queued = { ...document, status: 'queued', phase: 'assessment', assessment: null };
    request.flush(queued);
    expect(store.uploading()).toBe(false);
    expect(store.uploadProgress()).toBeNull();
    expect(store.selected()?.id).toBe(document.id);
    expect(store.announcement()).toBe('Original uploaded. Assessment starts automatically.');
    expect(store.announcement()).not.toMatch(/complete/i);
    http.expectOne(`/documents/${document.id}`).flush(queued);
    http.expectOne((request) => request.url === '/documents').flush({ items: [queued], page: 1, pageSize: 20, total: 1 });
    http.expectOne('/documents/allowance').flush({});
    http.verify();
  });
});

describe('Rewrite strength and Unslopify', () => {
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
  const assessed: IDocumentAssessmentResponse = {
    ...document,
    status: 'assessed',
    phase: 'assessment',
    strength: null,
    assessment: { rubric: 'ai-style-v1', score: 62, patterns: [] }
  };

  it('starts at 50, keeps the chosen strength across polls, and labels Light, Balanced and Thorough', () => {
    const { store, http } = setup();
    store.select(assessed);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    flushPreview(http);
    expect(store.strength()).toBe(50);
    expect(store.strengthLabel()).toBe('Balanced');
    store.strength.set(20);
    expect(store.strengthLabel()).toBe('Light');
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    expect(store.strength()).toBe(20);
    store.strength.set(80);
    expect(store.strengthLabel()).toBe('Thorough');
    const retryable = { ...assessed, id: '00000000-0000-4000-8000-000000000009', strength: 70, status: 'failed' } as const;
    store.select({ ...retryable, phase: 'rewrite' });
    http.expectOne(`/documents/${retryable.id}`).flush({ ...retryable, phase: 'rewrite' });
    http.expectOne(`/documents/${retryable.id}/preview`).flush({ blocks: [] });
    expect(store.strength()).toBe(70);
    http.verify();
  });

  it('sends the strength once for a double start and shows the queued editing phase', () => {
    const { store, http } = setup();
    store.select(assessed);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    flushPreview(http);
    store.strength.set(80);
    store.unslopify(assessed);
    store.unslopify(assessed);
    expect(store.unslopifying()).toBe(document.id);
    const request = http.expectOne(`/documents/${document.id}/unslopify`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ strength: 80 });
    const queued = { ...assessed, status: 'queued', phase: 'rewrite', strength: 80 };
    request.flush(queued);
    expect(store.unslopifying()).toBeNull();
    expect(store.selected()?.status).toBe('queued');
    expect(store.phase(store.selected()!).label).toBe('Queued for editing');
    expect(store.phaseAnnouncement()).toBe('river.docx: Queued for editing.');
    http.expectOne('/documents/allowance').flush({});
    http.verify();
  });

  it('keeps the assessed document and reports a refusal beside the action', () => {
    const { store, http } = setup();
    store.select(assessed);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    flushPreview(http);
    store.unslopify(assessed);
    const message = 'Your FREE allowance of 3 documents is fully used or reserved. It resets on 2026-12-01T00:00:00.000Z (UTC).';
    http.expectOne(`/documents/${document.id}/unslopify`).flush({ message }, { status: 409, statusText: 'Conflict' });
    expect(store.unslopifying()).toBeNull();
    expect(store.unslopifyError()).toEqual({ id: document.id, message });
    expect(store.selected()?.status).toBe('assessed');
    http.expectOne('/documents/allowance').flush({});
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    expect(store.detail()?.assessment?.score).toBe(62);
    http.verify();
  });
});

describe('Document preview', () => {
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
  const assessed: IDocumentAssessmentResponse = {
    ...document,
    status: 'assessed',
    phase: 'assessment',
    assessment: { rubric: 'ai-style-v1', score: 62, patterns: [] }
  };
  const blocks = [{ kind: 'paragraph', level: null, text: 'Hello', inlines: null, rows: null, reason: null }];

  it('loads the preview once an assessment exists and keeps it across polls', () => {
    const { store, http } = setup();
    const queued = { ...assessed, status: 'queued', assessment: null };
    store.select(queued);
    http.expectOne(`/documents/${document.id}`).flush(queued);
    http.expectNone(`/documents/${document.id}/preview`);
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    http.expectOne(`/documents/${document.id}/preview`).flush({ blocks });
    expect(store.preview()).toEqual(blocks);
    store.loadSelected(true);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    http.expectNone(`/documents/${document.id}/preview`);
    expect(store.preview()).toEqual(blocks);
    store.select(null);
    expect(store.preview()).toBeNull();
    http.verify();
  });

  it('explains a missing preview instead of failing the document', () => {
    const { store, http } = setup();
    store.select(assessed);
    http.expectOne(`/documents/${document.id}`).flush(assessed);
    http.expectOne(`/documents/${document.id}/preview`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    expect(store.preview()).toBeNull();
    expect(store.previewError()).toBe('No preview is available for this document.');
    expect(store.detail()?.assessment?.score).toBe(62);
    http.verify();
  });
});
