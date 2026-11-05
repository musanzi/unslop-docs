import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type { IDocumentPage, IDocumentResponse } from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DocumentsStore {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private request = 0;
  readonly items = signal<IDocumentResponse[]>([]);
  readonly selected = signal<IDocumentResponse | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly downloading = signal(false);
  readonly listError = signal('');
  readonly uploadError = signal('');
  readonly downloadError = signal('');
  readonly announcement = signal('');
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / 20)));

  load(page = this.page()): void {
    const request = ++this.request;
    this.loading.set(true);
    this.listError.set('');
    this.http
      .get<IDocumentPage>('/documents', { params: { page, pageSize: 20 }, transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (request !== this.request) return;
          this.items.set(result.items);
          this.total.set(result.total);
          this.page.set(result.page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.request) return;
          this.listError.set(this.errorMessage(error, 'Could not load your documents. Try again.'));
          this.loading.set(false);
        }
      });
  }

  select(document: IDocumentResponse | null): void {
    this.selected.set(document);
    this.uploadError.set('');
    this.downloadError.set('');
    this.announcement.set('');
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
          this.announcement.set('Original uploaded.');
          this.items.set([document, ...(this.page() === 1 ? this.items() : [])].slice(0, 20));
          this.page.set(1);
          this.total.update((total) => total + 1);
          this.load(1);
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(this.errorMessage(error, 'Upload failed. Check your history before trying again.'));
          if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) this.load(1);
        }
      });
  }

  async original(document: IDocumentResponse): Promise<Blob | null> {
    if (this.downloading()) return null;
    this.downloading.set(true);
    this.downloadError.set('');
    try {
      return await firstValueFrom(
        this.http
          .get(`/documents/${document.id}/original`, {
            responseType: 'blob',
            transferCache: false
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
      );
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.downloadError.set(this.errorMessage(error, 'Original unavailable. Try again.'));
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
      if ([400, 413].includes(error.status) && typeof error.error?.message === 'string') return error.error.message;
    }
    return fallback;
  }
}
