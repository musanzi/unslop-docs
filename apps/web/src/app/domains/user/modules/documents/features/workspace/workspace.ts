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
  host: {
    class:
      'document-workspace-theme block text-[0.9375rem] leading-[1.5] text-ink scheme-dark selection:bg-ink selection:text-canvas [&_a]:text-inherit [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-[0.2em] [&_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:text-muted [&_button:disabled]:opacity-65 [&_:is(a,button):focus-visible]:outline-2 [&_:is(a,button):focus-visible]:outline-offset-[3px] [&_:is(a,button):focus-visible]:outline-ink [&_mat-icon]:size-4.5 [&_mat-icon]:shrink-0'
  },
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
    afterNextRender(() => this.store.start());
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

  protected async download(document: IDocumentResponse, version: 'original' | 'revised' = 'original'): Promise<void> {
    const blob = await this.store.download(document, version);
    if (!blob || this.destroyRef.destroyed) return;
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = version === 'original' ? document.filename : `revised-${document.filename}`;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
