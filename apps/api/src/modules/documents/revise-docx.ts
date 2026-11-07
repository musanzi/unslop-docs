import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import { DocxDocument, DocxRun, DocxSource } from './docx-model';
import { MeaningReviewRequest } from './meaning-review';
import { isValidationCheck, KeptPassage, passageExcerpt, RevisionNotices, uneditedElements } from './revision-notices';
import {
  paragraphs,
  requirePreserved,
  RevisionValidationError,
  ValidationCheck,
  validateRevisionModels,
  validateTextPreservation
} from './revision-validation';
import { readDocx } from './validate-docx';

export interface EditSpan {
  readonly id: string;
  readonly text: string;
}
export interface RevisedSpan extends EditSpan {
  readonly kept?: ValidationCheck;
}
export interface RevisedDocx {
  readonly bytes: Buffer;
  readonly notices: RevisionNotices;
}
export interface EditChunk {
  readonly id: string;
  readonly spans: readonly EditSpan[];
}
export interface EditProvider {
  edit(system: string, chunk: EditChunk, signal?: AbortSignal): Promise<unknown>;
  reviewMeaning?(system: string, request: MeaningReviewRequest, signal?: AbortSignal): Promise<unknown>;
}
interface TextNode {
  readonly source: DocxSource;
  readonly contentStart: number;
  readonly text: string;
}
interface Passage {
  readonly nodes: TextNode[];
}
interface SourceSpan extends EditSpan {
  readonly source: DocxSource;
  readonly offset: number;
  readonly contentStart: number;
  readonly emptied: readonly TextNode[];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function passages(document: DocxDocument): Passage[] {
  const xml = document.readXmlPart(document.mainPart);
  const raw = (source?: DocxSource) => (source ? xml.slice(source.start, source.end) : '');
  const prefix = (node: TextNode) =>
    /^<([\w.-]+:)?t\b/.exec(xml.slice(node.source.start, node.contentStart))?.[1] ?? '';
  const preserved = (node: TextNode) =>
    /\sxml:space\s*=\s*["']preserve["']/.test(xml.slice(node.source.start, node.contentStart));
  const continuous = (previous: TextNode, next: TextNode, run: DocxRun | undefined) => {
    const name = escapeRegExp(prefix(previous));
    const withinRun = `(?:\\s|<${name}lastRenderedPageBreak\\b[^<>]*/>)`;
    const acrossRuns = `(?:${withinRun}|</${name}r>|<${name}r(?:\\s[^<>]*)?>|<${name}(?:proofErr|bookmarkStart|bookmarkEnd)\\b[^<>]*/>)`;
    if (!run) return new RegExp(`^${withinRun}*$`).test(xml.slice(previous.source.end, next.source.start));
    const properties = run.properties ?? { start: next.source.start, end: next.source.start };
    if (properties.start < previous.source.end || properties.end > next.source.start) return false;
    const gap = xml.slice(previous.source.end, properties.start) + xml.slice(properties.end, next.source.start);
    return new RegExp(`^${acrossRuns}*$`).test(gap);
  };
  const sameFormatting = (left: DocxRun, right: DocxRun) =>
    left.bold === right.bold &&
    left.italic === right.italic &&
    JSON.stringify(left.hyperlink) === JSON.stringify(right.hyperlink) &&
    raw(left.properties) === raw(right.properties);
  const result: Passage[] = [];
  for (const paragraph of paragraphs(document.blocks)) {
    let current: Passage | undefined;
    let previousRun: DocxRun | undefined;
    let previousNode: TextNode | undefined;
    const open = (node: TextNode) => {
      current = { nodes: [node] };
      result.push(current);
    };
    const close = () => {
      if (!current) return;
      while (current.nodes.length > 1 && !preserved(current.nodes[0]) && /\s$/.test(current.nodes.at(-1).text)) {
        const node = current.nodes.pop();
        const rest = current;
        open(node);
        if (!/\s$/.test(rest.nodes.map((item) => item.text).join(''))) return;
      }
    };
    for (const inline of paragraph.inlines) {
      if (inline.kind !== 'run') {
        close();
        current = undefined;
        previousRun = undefined;
        continue;
      }
      for (const node of inline.textNodes) {
        const joins =
          !!current &&
          !!previousNode &&
          (previousRun === inline
            ? continuous(previousNode, node, undefined)
            : !!previousRun && sameFormatting(previousRun, inline) && continuous(previousNode, node, inline));
        if (joins) current.nodes.push(node);
        else {
          close();
          open(node);
        }
        previousNode = node;
        previousRun = inline;
      }
    }
    close();
  }
  return result;
}

function sourceSpans(document: DocxDocument): SourceSpan[] {
  return passages(document).flatMap((passage) => {
    const [first, ...emptied] = passage.nodes;
    const text = passage.nodes.map((node) => node.text).join('');
    const spans: SourceSpan[] = [];
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + 1600, text.length);
      if (end < text.length) {
        const space = text.lastIndexOf(' ', end - 1);
        if (space > offset) end = space + 1;
        else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      }
      spans.push({
        id: `${first.source.start}:${offset}`,
        text: text.slice(offset, end),
        source: first.source,
        contentStart: first.contentStart,
        offset,
        emptied
      });
      offset = end;
    }
    return spans;
  });
}

export function planDocxEdits(document: DocxDocument): readonly EditChunk[] {
  const chunks: EditChunk[] = [];
  let spans: EditSpan[] = [];
  let length = 0;
  const append = () => {
    if (!spans.length) return;
    const id = createHash('sha256')
      .update('docx-edit-v2\n')
      .update(document.readPart(document.mainPart))
      .update(JSON.stringify(spans))
      .digest('hex');
    chunks.push({ id, spans });
    spans = [];
    length = 0;
  };
  for (const { id, text } of sourceSpans(document)) {
    if (length + text.length > 3200 || spans.length === 24) append();
    spans.push({ id, text });
    length += text.length;
  }
  append();
  return chunks;
}

function usableText(source: string, text: string) {
  return (
    text.length <= source.length * 2 + 200 &&
    (!source.trim() || !!text.trim()) &&
    [...text].every((character) => {
      const code = character.codePointAt(0);
      return (code >= 32 || [9, 10, 13].includes(code)) && ![65534, 65535].includes(code);
    }) &&
    !/[\uD800-\uDFFF]/u.test(text)
  );
}

function restoreSurroundingWhitespace(source: string, text: string) {
  return /^\s*/.exec(source)[0] + text.trim() + /\s*$/.exec(source)[0];
}

function revisedSpan(source: EditSpan, text: string, kept: unknown): RevisedSpan {
  if (text === source.text) return isValidationCheck(kept) ? { id: source.id, text, kept } : { id: source.id, text };
  if (!usableText(source.text, text)) return { id: source.id, text: source.text, kept: 'response' };
  const restored = restoreSurroundingWhitespace(source.text, text);
  try {
    validateTextPreservation(source.text, restored);
  } catch (error) {
    if (error instanceof RevisionValidationError) return { id: source.id, text: source.text, kept: error.check };
    throw error;
  }
  return { id: source.id, text: restored };
}

export function validateChunkResult(chunk: EditChunk, raw: unknown): readonly RevisedSpan[] {
  requirePreserved(!!raw && typeof raw === 'object' && 'edits' in raw && Array.isArray(raw.edits), 'response');
  const edits: unknown[] = raw.edits;
  requirePreserved(edits.length === chunk.spans.length, 'structure');
  return edits.map((edit, index) => {
    requirePreserved(
      !!edit && typeof edit === 'object' && 'id' in edit && 'text' in edit && typeof edit.text === 'string',
      'response'
    );
    const source = chunk.spans[index];
    requirePreserved(edit.id === source.id, 'structure');
    return revisedSpan(source, edit.text, 'kept' in edit ? edit.kept : undefined);
  });
}

export async function constructRevisedDocx(
  document: DocxDocument,
  results: ReadonlyMap<string, readonly EditSpan[]>
): Promise<RevisedDocx> {
  const plan = planDocxEdits(document);
  requirePreserved(results.size === plan.length, 'response');
  const spans = plan.flatMap((chunk) => validateChunkResult(chunk, { edits: results.get(chunk.id) }));
  const edits = new Map(spans.map((span) => [span.id, span.text]));
  const keptPassages: KeptPassage[] = spans
    .filter((span) => span.kept)
    .map((span) => ({ check: span.kept, span: span.id, excerpt: passageExcerpt(span.text) }));
  const nodes = new Map<number, { source: DocxSource; contentStart: number; text: string }>();
  for (const span of sourceSpans(document)) {
    const node = nodes.get(span.source.start) ?? { source: span.source, contentStart: span.contentStart, text: '' };
    node.text += edits.get(span.id);
    nodes.set(span.source.start, node);
    for (const emptied of span.emptied)
      nodes.set(emptied.source.start, { source: emptied.source, contentStart: emptied.contentStart, text: '' });
  }
  let xml = document.readXmlPart(document.mainPart);
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', '&#13;');
  for (const { source, contentStart, text } of [...nodes.values()].reverse()) {
    const original = xml.slice(source.start, source.end);
    const openEnd = contentStart - source.start;
    const closeStart = original.lastIndexOf('</');
    requirePreserved(closeStart >= openEnd, 'structure');
    xml = xml.slice(0, source.start + openEnd) + escape(text) + xml.slice(source.start + closeStart);
  }
  xml = xml.replace(/^(<\?xml\b[^?]*encoding=["'])[^"']+(["'][^?]*\?>)/, '$1UTF-8$2');
  const zip = new ZipFile();
  const output: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => output.push(chunk));
    zip.outputStream.on('error', reject);
    zip.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(output)));
  });
  zip.addBuffer(Buffer.from(xml), document.mainPart);
  for (const part of document.protectedParts) {
    if (part.name.endsWith('/')) zip.addEmptyDirectory(part.name);
    else zip.addBuffer(document.readPart(part.name), part.name);
  }
  zip.end();
  const candidate = await bytes;
  const revised = await readDocx(candidate);
  const originals = paragraphs(document.blocks);
  const revisions = paragraphs(revised.blocks);
  requirePreserved(originals.length === revisions.length, 'structure');
  const sourcePlan = sourceSpans(document);
  const restored = new Map<string, RevisedSpan>();
  originals.forEach((paragraph, index) => {
    try {
      validateTextPreservation(paragraph.text, revisions[index].text);
    } catch (error) {
      if (!(error instanceof RevisionValidationError)) throw error;
      const affected = sourcePlan.filter(
        (span) => span.source.start >= paragraph.source.start && span.source.end <= paragraph.source.end
      );
      requirePreserved(
        affected.some((span) => edits.get(span.id) !== span.text),
        error.check
      );
      for (const span of affected) restored.set(span.id, { id: span.id, text: span.text, kept: error.check });
    }
  });
  if (restored.size) {
    const validated = new Map(spans.map((span) => [span.id, span]));
    return constructRevisedDocx(
      document,
      new Map(
        plan.map((chunk) => [chunk.id, chunk.spans.map((span) => restored.get(span.id) ?? validated.get(span.id))])
      )
    );
  }
  return { bytes: candidate, notices: { keptPassages, uneditedElements: uneditedElements(document) } };
}

export async function validateRevisedDocx(source: DocxDocument, bytes: Buffer): Promise<void> {
  let revised: DocxDocument;
  try {
    revised = await readDocx(bytes);
  } catch {
    throw new RevisionValidationError('structure');
  }
  validateRevisionModels(source, revised);
}
