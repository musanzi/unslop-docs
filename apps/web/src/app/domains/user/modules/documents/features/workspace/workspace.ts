import { DatePipe, DecimalPipe, DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, inject, viewChild } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { RouterLink } from '@angular/router';
import type { IDocumentResponse } from '@unslop-docs/api-contracts';
import { Media } from '@web/core/media';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { DocumentsStore } from '../../data-access/documents.store';

@Component({
  selector: 'document-workspace',
  imports: [DatePipe, DecimalPipe, MatIcon, MatSidenav, MatSidenavContainer, MatSidenavContent, RouterLink],
  providers: [DocumentsStore],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Workspace {
  protected readonly store = inject(DocumentsStore);
  protected readonly auth = inject(AuthStore);
  protected readonly isMobile = inject(Media).match('(max-width: 767px)');
  private readonly sidenav = viewChild(MatSidenav);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.store.load());
  }

  protected select(document: IDocumentResponse | null): void {
    this.store.select(document);
    if (this.isMobile()) void this.sidenav()?.close();
  }

  protected upload(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.store.upload(file);
  }

  protected async download(document: IDocumentResponse): Promise<void> {
    const blob = await this.store.original(document);
    if (!blob || this.destroyRef.destroyed) return;
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = document.filename;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
