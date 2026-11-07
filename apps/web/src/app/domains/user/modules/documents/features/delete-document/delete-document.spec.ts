import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import type { IDocumentResponse } from '@unslop-docs/api-contracts';
import { readFileSync } from 'node:fs';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteDocument from './delete-document';

const idle: IDocumentResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  filename: 'river.docx',
  size: 1024,
  createdAt: '2026-11-05T10:00:00.000Z',
  status: 'assessed',
  phase: 'assessment',
  processingStage: null,
  progress: null,
  strength: null,
  failure: null
};
const sentToDeepSeek = 'Any text already sent to DeepSeek for editing may still be processed there';

describe('Delete document confirmation', () => {
  function render(document: IDocumentResponse): string {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: document },
        { provide: MatDialogRef, useValue: { close: vi.fn() } }
      ]
    });
    TestBed.overrideComponent(DeleteDocument, {
      set: { template: readFileSync(`${import.meta.dirname}/delete-document.html`, 'utf8'), templateUrl: undefined }
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockImplementation(() =>
      of(globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    );
    const fixture = TestBed.createComponent(DeleteDocument);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    ['queued', 'assessment', null],
    ['processing', 'assessment', 'assessing'],
    ['queued', 'rewrite', null],
    ['processing', 'rewrite', 'editing'],
    ['processing', 'rewrite', 'validating']
  ] as const)('explains that a %s %s document stops and its DeepSeek result is discarded', (status, phase, stage) => {
    const text = render({ ...idle, status, phase, processingStage: stage });
    expect(text).toContain('Delete river.docx?');
    expect(text).toContain('This stops the current processing');
    expect(text).toContain(sentToDeepSeek);
    expect(text).toContain('the result will be discarded');
    expect(text).toContain('cannot be undone');
  });

  it.each(['stored', 'assessed', 'completed', 'failed'] as const)(
    'does not mention DeepSeek for an idle %s document',
    (status) => {
      const text = render({ ...idle, status });
      expect(text).toContain('Delete river.docx?');
      expect(text).toContain('cannot be undone');
      expect(text).not.toContain('DeepSeek');
      expect(text).not.toContain('stops');
    }
  );
});
