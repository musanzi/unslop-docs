import { DocxBlock, DocxDocument } from './docx-model';
import { ValidationCheck, validationReasons } from './revision-validation';

export interface KeptPassage {
  readonly check: ValidationCheck;
  readonly span: string;
  readonly excerpt: string;
}
export interface UneditedElement {
  readonly reason: string;
  readonly count: number;
}
export interface RevisionNotices {
  readonly keptPassages: readonly KeptPassage[];
  readonly uneditedElements: readonly UneditedElement[];
}

const excerptLength = 120;

export function isValidationCheck(value: unknown): value is ValidationCheck {
  return typeof value === 'string' && value in validationReasons;
}

export function passageExcerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > excerptLength ? `${trimmed.slice(0, excerptLength)}…` : trimmed;
}

export function uneditedElements(document: DocxDocument): UneditedElement[] {
  const counts = new Map<string, number>();
  const count = (blocks: readonly DocxBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'table') block.rows.forEach((row) => row.cells.forEach((cell) => count(cell.blocks)));
      else if (block.kind === 'protected') counts.set(block.reason, (counts.get(block.reason) ?? 0) + 1);
      else
        for (const inline of block.inlines)
          if (inline.kind === 'protected') counts.set(inline.reason, (counts.get(inline.reason) ?? 0) + 1);
    }
  };
  count(document.blocks);
  return [...counts]
    .map(([reason, total]) => ({ reason, count: total }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
}
