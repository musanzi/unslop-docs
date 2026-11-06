import { DatePipe, DecimalPipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
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
import type { IStyleAssessmentResponse, IDocumentResponse } from '@unslop-docs/api-contracts';
import { Media } from '@web/core/media';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { User } from '@web/shared/ui/user/user';
import { subscriptionContactUrl, subscriptionPlans } from '@web/shared/data/subscription-plans';
import { firstValueFrom } from 'rxjs';
import {
  defaultRewriteStrength,
  DocumentsStore,
  strengthLabel,
  type DocumentPhaseKey
} from '../../data-access/documents.store';
import { DeleteDocumentDialog } from '../../data-access/delete-document-dialog';

const phaseIcons: Record<DocumentPhaseKey, string> = {
  stored: 'file-text',
  queued: 'hourglass',
  assessing: 'scan-text',
  'ready-to-edit': 'file-check',
  editing: 'wand-sparkles',
  'checking-result': 'scan-text',
  'download-ready': 'circle-check',
  failed: 'circle-alert'
};

@Component({
  selector: 'document-workspace',
  imports: [
    DatePipe,
    DecimalPipe,
    MatIcon,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    NgTemplateOutlet,
    RouterLink,
    User
  ],
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
  protected readonly phase = computed(() => {
    const document = this.store.selected();
    return document ? this.store.phase(document) : null;
  });
  protected readonly phaseIcon = computed(() => phaseIcons[this.phase()?.key ?? 'stored']);
  protected readonly celebrating = computed(() => {
    const document = this.store.selected();
    return !!document && this.store.celebrating() === document.id;
  });
  protected readonly editing = computed(() => {
    const document = this.store.selected();
    return document?.processingStage === 'editing' ? document.progress : null;
  });
  protected readonly phaseDetail = computed(() => {
    const document = this.store.selected();
    const phase = this.phase();
    if (!document || !phase) return '';
    switch (phase.key) {
      case 'queued':
        return document.phase === 'rewrite'
          ? 'Editing starts automatically. You can leave and come back.'
          : 'Assessment starts automatically. You can leave and come back.';
      case 'assessing':
        return '';
      case 'ready-to-edit':
        return 'Choose a rewrite strength, then start Unslopify.';
      case 'editing': {
        const progress = this.editing();
        return progress ? `${progress.completed} of ${progress.total} edits complete.` : 'Rewriting your document.';
      }
      case 'checking-result':
        return document.processingStage === 'validating'
          ? 'Comparing the revision with the original.'
          : 'Rechecking the revised document';
      case 'download-ready':
        return 'Your revised DOCX is ready.';
      case 'failed':
        return document.phase === 'rewrite' ? 'Editing failed.' : 'Assessment failed.';
      default:
        return 'This original was saved before writing assessments were available.';
    }
  });
  protected readonly retryLabel = computed(() =>
    this.store.selected()?.phase === 'rewrite' ? 'Retry editing' : 'Retry assessment'
  );
  protected readonly style = computed(() => this.store.detail()?.assessment?.style ?? null);
  protected readonly finalStyle = computed(() => this.store.detail()?.finalAssessment?.style ?? null);
  protected readonly assessmentChanged = computed(() => {
    const before = this.style();
    const after = this.finalStyle();
    return !!before && !!after && before.modelVersion !== after.modelVersion;
  });
  protected readonly finalScoreNote = computed(() => {
    const detail = this.store.detail();
    if (detail?.finalScoreUnavailable)
      return 'The revised document is ready, but its final score is unavailable: the final assessment did not finish.';
    if (detail?.status === 'completed' && detail.strength === null && this.finalStyle() === null)
      return 'Scores were not recorded for this document.';
    return null;
  });
  protected readonly unslopifyNote = computed(() => {
    const document = this.store.selected();
    if (document && this.store.unslopifyError()?.id === document.id) return 'unslopify-error';
    return this.store.allowanceBlocked() ? 'allowance-limit' : null;
  });
  protected readonly savedStrength = computed(() => {
    const strength = this.store.selected()?.strength;
    return strength === null || strength === undefined ? null : { value: strength, label: strengthLabel(strength) };
  });
  protected readonly keptPassages = computed(() => this.store.detail()?.revisionNotices?.keptPassages ?? []);
  protected readonly uneditedSummary = computed(() => {
    const elements = this.store.detail()?.revisionNotices?.uneditedElements ?? [];
    return elements.map((element) => `${element.count} ${element.reason}${element.count === 1 ? '' : 's'}`).join(', ');
  });
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

  protected modelScore(style: IStyleAssessmentResponse): number | null {
    return style.score === null ? null : Math.round(style.score);
  }

  protected setStrength(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.store.strength.set(Math.min(100, Math.max(1, Number(input.value) || defaultRewriteStrength)));
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
