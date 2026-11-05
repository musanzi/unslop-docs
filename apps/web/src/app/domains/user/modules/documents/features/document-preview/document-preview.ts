import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { IPreviewBlockResponse } from '@unslop-docs/api-contracts';

export type PreviewSegment =
  { kind: 'list'; items: IPreviewBlockResponse[] } | { kind: 'block'; block: IPreviewBlockResponse };

const listIndents = ['', 'ml-5', 'ml-10', 'ml-14'];

export function segmentBlocks(blocks: IPreviewBlockResponse[]): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  for (const block of blocks) {
    const last = segments.at(-1);
    if (block.kind === 'list-item') {
      if (last?.kind === 'list') last.items.push(block);
      else segments.push({ kind: 'list', items: [block] });
    } else {
      segments.push({ kind: 'block', block });
    }
  }
  return segments;
}

export function protectedLabel(reason: string | null): string {
  const name = (reason ?? 'element').replace(/[-_]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

@Component({
  selector: 'document-preview',
  imports: [NgTemplateOutlet],
  templateUrl: './document-preview.html',
  host: { class: 'block min-w-0 text-[0.9375rem] leading-7 text-ink [overflow-wrap:anywhere]' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentPreview {
  readonly blocks = input.required<IPreviewBlockResponse[]>();
  protected readonly segments = computed(() => segmentBlocks(this.blocks()));
  protected readonly protectedLabel = protectedLabel;

  protected headingLevel(block: IPreviewBlockResponse): number {
    return Math.min(6, Math.max(1, block.level ?? 1) + 2);
  }

  protected indent(block: IPreviewBlockResponse): string {
    return listIndents[Math.min(listIndents.length - 1, Math.max(1, block.level ?? 1) - 1)];
  }
}
