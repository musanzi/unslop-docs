import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type {
  IAllowanceResponse,
  IDocumentAssessmentResponse,
  IDocumentPage,
  IDocumentPreviewResponse,
  IDocumentResponse,
  IPreviewBlockResponse
} from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { firstValueFrom } from 'rxjs';

export type DocumentPhaseKey =
  'stored' | 'queued' | 'assessing' | 'ready-to-edit' | 'editing' | 'checking-result' | 'download-ready' | 'failed';

export interface DocumentPhase {
  key: DocumentPhaseKey;
  label: string;
}

export interface UploadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

export const defaultRewriteStrength = 50;

export function strengthLabel(strength: number): 'Light' | 'Balanced' | 'Thorough' {
  if (strength <= 33) return 'Light';
  if (strength <= 66) return 'Balanced';
  return 'Thorough';
}

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
    assessed: 'Ready to unslopify',
    completed: 'Download ready',
    failed: 'Failed'
  };
  readonly stageLabels = {
    assessing: 'Assessing writing',
    editing: 'Editing your document',
    validating: 'Checking the revised document',
    'final-assessment': 'Assessing the revised document'
  };

  phase(document: IDocumentResponse): DocumentPhase {
    const rewrite = document.phase === 'rewrite';
    switch (document.status) {
      case 'queued':
        return { key: 'queued', label: rewrite ? 'Queued for editing' : 'Queued for assessment' };
      case 'processing': {
        const stage = document.processingStage;
        const label = stage ? this.stageLabels[stage] : this.statusLabels.processing;
        if (stage === 'editing') return { key: 'editing', label };
        if (stage === 'validating' || stage === 'final-assessment') return { key: 'checking-result', label };
        return { key: 'assessing', label };
      }
      case 'assessed':
        return { key: 'ready-to-edit', label: this.statusLabels.assessed };
      case 'completed':
        return { key: 'download-ready', label: this.statusLabels.completed };
      case 'failed':
        return { key: 'failed', label: this.statusLabels.failed };
      default:
        return { key: 'stored', label: this.statusLabels.stored };
    }
  }

  private observe(documents: IDocumentResponse[]): void {
    for (const document of documents) {
      const phase = this.phase(document);
      const previous = this.observedPhases.get(document.id);
      this.observedPhases.set(document.id, phase.key);
      if (previous === undefined || previous === phase.key || this.selected()?.id !== document.id) continue;
      this.phaseAnnouncement.set(`${document.filename}: ${phase.label}.`);
      if (phase.key === 'download-ready') this.celebrating.set(document.id);
    }
  }

  readonly items = signal<IDocumentResponse[]>([]);
  readonly selected = signal<IDocumentResponse | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly uploadProgress = signal<UploadProgress | null>(null);
  readonly retrying = signal<string | null>(null);
  readonly retryError = signal<{ id: string; message: string } | null>(null);
  readonly deleting = signal<string | null>(null);
  readonly deleteError = signal<{ id: string; message: string } | null>(null);
  readonly downloading = signal(false);
  readonly listError = signal('');
  readonly uploadError = signal('');
  readonly downloadError = signal('');
  readonly announcement = signal('');
  readonly phaseAnnouncement = signal('');
  readonly strength = linkedSignal<string | undefined, number>({
    source: () => this.selected()?.id,
    computation: () => this.selected()?.strength ?? defaultRewriteStrength
  });
  readonly strengthLabel = computed(() => strengthLabel(this.strength()));
  readonly unslopifying = signal<string | null>(null);
  readonly unslopifyError = signal<{ id: string; message: string } | null>(null);
  readonly preview = signal<IPreviewBlockResponse[] | null>(null);
  readonly previewError = signal('');
  readonly previewLoading = signal(false);
  private previewRequest = 0;
  private previewFor: string | null = null;
  readonly celebrating = signal<string | null>(null);
  private readonly observedPhases = new Map<string, DocumentPhaseKey>();
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
          this.observe(result.items);
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
    this.unslopifyError.set(null);
    this.resetPreview();
    this.celebrating.set(null);
    this.phaseAnnouncement.set('');
    if (document) this.observe([document]);
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
          this.observe([detail]);
          this.detail.set(detail);
          this.selected.set(detail);
          this.items.update((items) => items.map((item) => (item.id === detail.id ? detail : item)));
          this.detailError.set('');
          this.detailLoading.set(false);
          if (detail.assessment) this.loadPreview(detail);
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
    this.uploadProgress.set(null);
    const body = new FormData();
    body.append('file', file);
    this.http
      .post<IDocumentResponse>('/documents', body, { reportProgress: true, observe: 'events' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? null;
            const percent = total ? Math.min(100, Math.round((event.loaded / total) * 100)) : null;
            this.uploadProgress.set({ loaded: event.loaded, total, percent });
            return;
          }
          if (event.type !== HttpEventType.Response || !event.body) return;
          const document = event.body;
          this.uploading.set(false);
          this.uploadProgress.set(null);
          this.select(document);
          this.announcement.set('Original uploaded. Assessment starts automatically.');
          this.items.set([document, ...(this.page() === 1 ? this.items() : [])].slice(0, 20));
          this.page.set(1);
          this.total.update((total) => total + 1);
          this.load(1);
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.uploadProgress.set(null);
          this.uploadError.set(this.errorMessage(error, 'Upload failed. Check your history before trying again.'));
          if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) this.load(1);
          else this.loadAllowance();
        }
      });
  }

  private resetPreview(): void {
    this.previewRequest++;
    this.previewFor = null;
    this.preview.set(null);
    this.previewError.set('');
    this.previewLoading.set(false);
  }

  loadPreview(document: IDocumentResponse): void {
    if (this.previewFor === document.id) return;
    this.previewFor = document.id;
    const request = ++this.previewRequest;
    this.previewLoading.set(true);
    this.previewError.set('');
    this.http
      .get<IDocumentPreviewResponse>(`/documents/${document.id}/preview`, { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (request !== this.previewRequest) return;
          this.preview.set(result.blocks);
          this.previewLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.previewRequest) return;
          this.previewLoading.set(false);
          const missing = error instanceof HttpErrorResponse && error.status === 404;
          this.previewError.set(
            missing
              ? 'No preview is available for this document.'
              : this.errorMessage(error, 'The preview could not be loaded. Try again.')
          );
          if (!missing) this.previewFor = null;
        }
      });
  }

  unslopify(document: IDocumentResponse): void {
    if (this.unslopifying() || document.status !== 'assessed') return;
    this.unslopifying.set(document.id);
    this.unslopifyError.set(null);
    this.announcement.set('');
    this.http
      .post<IDocumentResponse>(`/documents/${document.id}/unslopify`, { strength: this.strength() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queued) => {
          this.unslopifying.set(null);
          this.observe([queued]);
          this.items.update((items) => items.map((item) => (item.id === queued.id ? queued : item)));
          if (this.selected()?.id === queued.id) {
            this.selected.set(queued);
            this.detail.update((detail) => (detail ? { ...detail, ...queued } : detail));
          }
          this.loadAllowance();
        },
        error: (error: unknown) => {
          this.unslopifying.set(null);
          this.unslopifyError.set({
            id: document.id,
            message: this.errorMessage(error, 'Unslopify could not be started. Refresh and try again.')
          });
          this.loadAllowance();
          if (this.selected()?.id === document.id) this.loadSelected(true);
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
          this.observe([queued]);
          this.items.update((items) => items.map((item) => (item.id === queued.id ? queued : item)));
          if (this.selected()?.id === queued.id) this.select(queued);
          this.announcement.set(
            document.phase === 'rewrite'
              ? 'Retry queued. Editing will start again.'
              : 'Retry queued. Assessment will start again.'
          );
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
      await firstValueFrom(this.http.delete(`/documents/${document.id}`).pipe(takeUntilDestroyed(this.destroyRef)), {
        defaultValue: null
      });
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
