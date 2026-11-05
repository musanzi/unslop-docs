import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type {
  IAllowanceResponse,
  IDocumentAssessmentResponse,
  IDocumentPage,
  IDocumentResponse
} from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DocumentsStore {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private request = 0;
  private allowanceRequest = 0;
  private detailRequest = 0;
  private listPending = false;
  private detailPending = false;
  private readonly browserDocument = inject(DOCUMENT);
  readonly allowance = signal<IAllowanceResponse | null>(null);
  readonly allowanceError = signal('');
  readonly allowanceBlocked = computed(() => this.allowance()?.remaining === 0);
  readonly detail = signal<IDocumentAssessmentResponse | null>(null);
  readonly detailError = signal('');
  readonly detailLoading = signal(false);
  readonly statusLabels: Record<IDocumentResponse['status'], string> = {
    stored: 'Original saved',
    queued: 'Queued',
    processing: 'Processing',
    assessed: 'Assessed',
    completed: 'Completed',
    failed: 'Failed'
  };
  readonly stageLabels = {
    assessing: 'Assessing writing',
    editing: 'Editing your document',
    validating: 'Checking the revised document',
    'final-assessment': 'Assessing the revised document'
  };

  progress(document: IDocumentResponse): string {
    return document.processingStage ? this.stageLabels[document.processingStage] : this.statusLabels[document.status];
  }

  readonly items = signal<IDocumentResponse[]>([]);
  readonly selected = signal<IDocumentResponse | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly retrying = signal<string | null>(null);
  readonly retryError = signal<{ id: string; message: string } | null>(null);
  readonly deleting = signal<string | null>(null);
  readonly deleteError = signal<{ id: string; message: string } | null>(null);
  readonly downloading = signal(false);
  readonly listError = signal('');
  readonly uploadError = signal('');
  readonly downloadError = signal('');
  readonly announcement = signal('');
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / 20)));

  start(): void {
    this.load();
    const timer = setInterval(() => {
      if (this.browserDocument.hidden || this.loading() || this.uploading()) return;
      this.load(this.page(), true);
      if (this.selected()) this.loadSelected(true);
    }, 5000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  load(page = this.page(), background = false): void {
    if (background && this.listPending) return;
    this.loadAllowance();
    this.listPending = true;
    const request = ++this.request;
    if (!background) this.loading.set(true);
    this.listError.set('');
    this.http
      .get<IDocumentPage>('/documents', { params: { page, pageSize: 20 }, transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (request !== this.request) return;
          this.listPending = false;
          this.items.set(result.items);
          this.total.set(result.total);
          this.page.set(result.page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.request) return;
          this.listPending = false;
          this.listError.set(this.errorMessage(error, 'Could not load your documents. Try again.'));
          this.loading.set(false);
        }
      });
  }

  loadAllowance(): void {
    const request = ++this.allowanceRequest;
    this.http
      .get<IAllowanceResponse>('/documents/allowance', { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (allowance) => {
          if (request !== this.allowanceRequest) return;
          this.allowance.set(allowance);
          this.allowanceError.set('');
        },
        error: (error: unknown) => {
          if (request !== this.allowanceRequest) return;
          this.allowance.set(null);
          this.allowanceError.set(this.errorMessage(error, 'Could not refresh your monthly allowance. Try again.'));
        }
      });
  }

  select(document: IDocumentResponse | null): void {
    this.selected.set(document);
    this.uploadError.set('');
    this.downloadError.set('');
    this.announcement.set('');
    this.detailRequest++;
    this.detail.set(null);
    this.detailError.set('');
    this.detailLoading.set(false);
    if (document) this.loadSelected();
  }

  loadSelected(background = false): void {
    const document = this.selected();
    if (!document || (background && this.detailPending)) return;
    this.detailPending = true;
    const request = ++this.detailRequest;
    if (!background) this.detailLoading.set(true);
    this.http
      .get<IDocumentAssessmentResponse>(`/documents/${document.id}`, { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (request !== this.detailRequest) return;
          this.detailPending = false;
          this.detail.set(detail);
          this.selected.set(detail);
          this.items.update((items) => items.map((item) => (item.id === detail.id ? detail : item)));
          this.detailError.set('');
          this.detailLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.detailRequest) return;
          this.detailPending = false;
          this.detailLoading.set(false);
          this.detailError.set(this.errorMessage(error, 'Could not refresh the writing assessment. Try again.'));
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.detail.set(null);
            this.detailError.set('This document is no longer available.');
          }
        }
      });
  }

  upload(file: File): void {
    if (this.uploading()) return;
    this.uploadError.set('');
    this.announcement.set('');
    if (file.size > 10000000) {
      this.uploadError.set('Choose a DOCX file of 10 MB or less.');
      return;
    }
    this.uploading.set(true);
    const body = new FormData();
    body.append('file', file);
    this.http
      .post<IDocumentResponse>('/documents', body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.uploading.set(false);
          this.select(document);
          this.announcement.set('Original uploaded. Assessment and editing queued.');
          this.items.set([document, ...(this.page() === 1 ? this.items() : [])].slice(0, 20));
          this.page.set(1);
          this.total.update((total) => total + 1);
          this.load(1);
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(this.errorMessage(error, 'Upload failed. Check your history before trying again.'));
          if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) this.load(1);
          else this.loadAllowance();
        }
      });
  }

  retry(document: IDocumentResponse): void {
    if (this.retrying() || document.status !== 'failed') return;
    this.retrying.set(document.id);
    this.retryError.set(null);
    this.announcement.set('');
    this.http
      .post<IDocumentResponse>(`/documents/${document.id}/retry`, null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queued) => {
          this.retrying.set(null);
          this.items.update((items) => items.map((item) => (item.id === queued.id ? queued : item)));
          if (this.selected()?.id === queued.id) this.select(queued);
          this.announcement.set('Retry queued. Assessment and editing will start again.');
          this.listPending = false;
          this.load(this.page(), true);
        },
        error: (error: unknown) => {
          this.retrying.set(null);
          this.retryError.set({
            id: document.id,
            message: this.errorMessage(
              error,
              'The retry could not be confirmed. Refresh your history before trying again.'
            )
          });
          this.listPending = false;
          this.load(this.page(), true);
          if (this.selected()?.id === document.id) this.loadSelected();
        }
      });
  }

  async delete(document: IDocumentResponse): Promise<boolean> {
    if (this.deleting()) return false;
    this.deleting.set(document.id);
    this.deleteError.set(null);
    this.announcement.set('');
    try {
      await firstValueFrom(
        this.http.delete(`/documents/${document.id}`).pipe(takeUntilDestroyed(this.destroyRef)),
        { defaultValue: null }
      );
    } catch (error) {
      if (this.destroyRef.destroyed) return false;
      if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
        this.deleting.set(null);
        this.deleteError.set({
          id: document.id,
          message: this.errorMessage(error, 'The document could not be deleted. Try again.')
        });
        return false;
      }
    }
    if (this.destroyRef.destroyed) return false;
    this.deleting.set(null);
    this.items.update((items) => items.filter((item) => item.id !== document.id));
    this.total.update((total) => Math.max(0, total - 1));
    if (this.selected()?.id === document.id) this.select(null);
    this.announcement.set(`${document.filename} deleted.`);
    this.listPending = false;
    this.load(this.page(), true);
    return true;
  }

  async download(document: IDocumentResponse, version: 'original' | 'revised'): Promise<Blob | null> {
    if (this.downloading()) return null;
    this.downloading.set(true);
    this.downloadError.set('');
    try {
      return await firstValueFrom(
        this.http
          .get(`/documents/${document.id}/${version}`, {
            responseType: 'blob',
            transferCache: false
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
      );
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.downloadError.set(this.errorMessage(error, 'Download unavailable. Try again.'));
      return null;
    } finally {
      this.downloading.set(false);
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.auth.setUser(null);
        void this.router.navigate(['/auth/sign-in']);
        return 'Your session expired. Sign in again.';
      }
      if ([400, 409, 413].includes(error.status) && typeof error.error?.message === 'string')
        return error.error.message;
    }
    return fallback;
  }
}
