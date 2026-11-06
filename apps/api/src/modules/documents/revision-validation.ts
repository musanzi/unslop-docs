import { DocxBlock, DocxDocument, DocxParagraph } from './docx-model';
import { documentLanguage } from './docx-language';

export const validationReasons = {
  response: 'The editor returned incomplete text. Upload the original again to start a new attempt.',
  structure:
    'The edit changed document structure or order. Simplify the affected headings, lists, or tables and upload again.',
  formatting: 'The edit changed text formatting or a link target. Simplify the formatting and upload again.',
  protected:
    'The edit changed protected document content. Keep images, equations, fields, and notes intact and upload again.',
  citation: 'The edit changed a citation. Keep citations as plain, complete text and upload again.',
  quotation: 'The edit changed a quotation. Keep quotations as plain, complete text and upload again.',
  reference: 'The edit introduced a reference. Upload the original again to start a new attempt.',
  fact: 'The edit changed a number, date, or URL. Keep these details as plain, complete text and upload again.',
  language:
    'The edit changed or could not preserve the language. Keep each passage in English or French and upload again.'
} as const;
export type ValidationCheck = keyof typeof validationReasons;

export class RevisionValidationError extends Error {
  constructor(readonly check: ValidationCheck) {
    super(validationReasons[check]);
  }
}
export function requirePreserved(condition: boolean, check: ValidationCheck): asserts condition {
  if (!condition) throw new RevisionValidationError(check);
}

export function paragraphs(blocks: readonly DocxBlock[]): DocxParagraph[] {
  return blocks.flatMap((block) =>
    block.kind === 'table'
      ? block.rows.flatMap((row) => row.cells.flatMap((cell) => paragraphs(cell.blocks)))
      : block.kind === 'protected'
        ? []
        : [block]
  );
}

function matches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const citations = (text: string) =>
  matches(
    text,
    /\[[^\]\r\n]+\]|\([^()\r\n]*(?:\d{4}|\bet al\.|\bs\.[^\S\r\n]?d\.|\bn\.d\.)[^()\r\n]*\)|\p{Lu}[\p{L}'’-]+(?:[^\S\r\n]+(?:et al\.|and|et|&|\p{Lu}[\p{L}'’-]+)){0,4}[^\S\r\n]*\(\d{4}[^)\r\n]*\)/gu
  );
const quotations = (text: string) =>
  matches(text, /"[^"\n]+"|“[^”]+”|«[^»]+»|(?<!\p{L})‘[^’]+’(?!\p{L})|(?<!\p{L})'[^'\n]+'(?!\p{L})/gu);
const facts = (text: string) =>
  matches(
    text,
    /(?:https?:\/\/|www\.)[^\s<>"“”«»]+|\b\d+(?:[.,:/–-]\d+)*(?:\s?%)?|\b(?:January|February|March|April|May|June|July|August|September|October|November|December|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/giu
  );
const references = (text: string) =>
  matches(
    text,
    /\b(?:doi\s*:\s*\S+|ISBN[\s:\d-]+|(?:according to|selon|d'après|source|references?|références?|bibliography|bibliographie)\b[^.!?\n]*)/giu
  );

export function validateTextPreservation(original: string, revised: string): void {
  if (original === revised) return;
  const before = citations(original);
  const after = citations(revised);
  requirePreserved(
    before.every((citation, index) => citation === after[index]),
    'citation'
  );
  requirePreserved(after.length === before.length, 'reference');
  requirePreserved(same(quotations(original), quotations(revised)), 'quotation');
  requirePreserved(same(facts(original), facts(revised)), 'fact');
  requirePreserved(same(references(original), references(revised)), 'reference');
  requirePreserved(!original.trim() || !!revised.trim(), 'structure');
  try {
    const source = documentLanguage(original);
    const result = documentLanguage(revised);
    if (source.status === 'supported' && result.status === 'supported')
      requirePreserved(same(source.languages, result.languages), 'language');
    if (source.status === 'uncertain' || result.status === 'uncertain') {
      const words = (text: string) => new Set(text.toLowerCase().match(/\p{L}+/gu) ?? []);
      const sourceWords = words(original);
      const resultWords = words(revised);
      const retained = [...sourceWords].filter((word) => resultWords.has(word)).length;
      requirePreserved(!sourceWords.size || retained / sourceWords.size >= 0.5, 'language');
    }
  } catch (error) {
    if (error instanceof RevisionValidationError) throw error;
    throw new RevisionValidationError('language');
  }
}

export function validateRevisionModels(original: DocxDocument, revised: DocxDocument): void {
  requirePreserved(original.mainPart === revised.mainPart, 'structure');
  requirePreserved(same(original.protectedParts, revised.protectedParts), 'protected');
  const sourceParagraphs = paragraphs(original.blocks);
  const revisedParagraphs = paragraphs(revised.blocks);
  const sourceTexts = new Set(sourceParagraphs.map((paragraph) => paragraph.text));
  requirePreserved(sourceParagraphs.length === revisedParagraphs.length, 'structure');
  revisedParagraphs.forEach((paragraph, index) => {
    requirePreserved(paragraph.text === sourceParagraphs[index].text || !sourceTexts.has(paragraph.text), 'structure');
  });
  const raw = (document: DocxDocument, source: { start: number; end: number }) =>
    document.readXmlPart(document.mainPart).slice(source.start, source.end);
  const compare = (left: readonly DocxBlock[], right: readonly DocxBlock[]) => {
    requirePreserved(left.length === right.length, 'structure');
    left.forEach((block, index) => {
      const other = right[index];
      requirePreserved(block.kind === other.kind, 'structure');
      if (block.kind === 'table' && other.kind === 'table') {
        requirePreserved(block.rows.length === other.rows.length, 'structure');
        block.rows.forEach((row, rowIndex) => {
          const otherRow = other.rows[rowIndex];
          requirePreserved(row.cells.length === otherRow.cells.length, 'structure');
          row.cells.forEach((cell, cellIndex) => compare(cell.blocks, otherRow.cells[cellIndex].blocks));
        });
      } else if (block.kind === 'protected' && other.kind === 'protected') {
        requirePreserved(raw(original, block.source) === raw(revised, other.source), 'protected');
      } else if (
        block.kind !== 'table' &&
        block.kind !== 'protected' &&
        other.kind !== 'table' &&
        other.kind !== 'protected'
      ) {
        requirePreserved(
          same([block.style, block.level, block.numbering], [other.style, other.level, other.numbering]),
          'structure'
        );
        requirePreserved(block.inlines.length === other.inlines.length, 'formatting');
        block.inlines.forEach((inline, inlineIndex) => {
          const otherInline = other.inlines[inlineIndex];
          requirePreserved(inline.kind === otherInline.kind, 'protected');
          if (inline.kind === 'protected') {
            requirePreserved(raw(original, inline.source) === raw(revised, otherInline.source), 'protected');
          } else if (otherInline.kind === 'run') {
            requirePreserved(
              same(
                [inline.bold, inline.italic, inline.hyperlink, inline.textNodes.length],
                [otherInline.bold, otherInline.italic, otherInline.hyperlink, otherInline.textNodes.length]
              ),
              'formatting'
            );
          }
        });
        validateTextPreservation(block.text, other.text);
      }
    });
  };
  compare(original.blocks, revised.blocks);
  const skeleton = (document: DocxDocument) => {
    let xml = document.readXmlPart(document.mainPart);
    const nodes = paragraphs(document.blocks).flatMap((paragraph) =>
      paragraph.inlines.flatMap((inline) => (inline.kind === 'run' ? inline.textNodes : []))
    );
    for (const node of nodes.reverse()) {
      const source = raw(document, node.source);
      const openEnd = node.contentStart - node.source.start;
      const closeStart = source.lastIndexOf('</');
      if (closeStart < openEnd) continue;
      xml = xml.slice(0, node.source.start + openEnd) + '#' + xml.slice(node.source.start + closeStart);
    }
    return xml.replace(/^(<\?xml\b[^?]*encoding=["'])[^"']+(["'][^?]*\?>)/, '$1UTF-8$2');
  };
  requirePreserved(skeleton(original) === skeleton(revised), 'structure');
  validateTextPreservation(original.text, revised.text);
}
