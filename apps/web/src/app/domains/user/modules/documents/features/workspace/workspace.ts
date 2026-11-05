import { DatePipe, DecimalPipe, DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  viewChild
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { RouterLink } from '@angular/router';
import type { IDocumentResponse } from '@unslop-docs/api-contracts';
import { Media } from '@web/core/media';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { User } from '@web/shared/ui/user/user';
import { subscriptionContactUrl, subscriptionPlans } from '@web/shared/data/subscription-plans';
import { firstValueFrom } from 'rxjs';
import { DocumentsStore } from '../../data-access/documents.store';
import { DeleteDocumentDialog } from '../../data-access/delete-document-dialog';

@Component({
  selector: 'document-workspace',
  imports: [DatePipe, DecimalPipe, MatIcon, MatSidenav, MatSidenavContainer, MatSidenavContent, RouterLink, User],
  providers: [DocumentsStore],
  templateUrl: './workspace.html',
  host: {
    class:
      'document-workspace-theme block bg-panel font-sans text-[0.9375rem] leading-[1.5] text-ink scheme-dark selection:bg-ink selection:text-canvas [&_mat-icon]:size-4.5 [&_mat-icon]:shrink-0'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Workspace {
  protected readonly store = inject(DocumentsStore);
  protected readonly auth = inject(AuthStore);
  protected readonly welcomeName = computed(() => this.auth.user()?.name?.trim());
  protected readonly planStatus = computed(() => this.store.allowance()?.status ?? this.auth.user()?.status);
  protected readonly currentPlan = computed(() => {
    const status = this.planStatus();
    return status ? subscriptionPlans[status] : null;
  });
  protected readonly plans = Object.entries(subscriptionPlans).map(([status, plan]) => ({
    ...plan,
    status,
    contactUrl: subscriptionContactUrl(plan.name)
  }));
  protected readonly contactUrl = subscriptionContactUrl();
  protected readonly isMobile = inject(Media).match('(max-width: 767px)');
  private readonly sidenav = viewChild(MatSidenav);
  private readonly newDocument = viewChild<ElementRef<HTMLButtonElement>>('newDocument');
  private readonly deleteDialog = inject(DeleteDocumentDialog);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.store.start());
  }

  protected select(document: IDocumentResponse | null): void {
    this.store.select(document);
    if (this.isMobile()) void this.sidenav()?.close();
  }

  protected async remove(document: IDocumentResponse): Promise<void> {
    const confirmed = await firstValueFrom(this.deleteDialog.open(document).afterClosed());
    if (!confirmed || this.destroyRef.destroyed) return;
    const deleted = await this.store.delete(document);
    if (deleted && !this.destroyRef.destroyed) this.newDocument()?.nativeElement.focus();
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
