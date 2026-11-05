import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { of } from 'rxjs';
import { IDocumentAssessmentResponse } from '@unslop-docs/api-contracts';
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

describe('Document workspace results', () => {
  async function render(detail: IDocumentAssessmentResponse) {
    const store = {
      start: vi.fn(),
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
