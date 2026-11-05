import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import { DocxDocument, DocxSource } from './docx-model';
import {
  paragraphs,
  requirePreserved,
  RevisionValidationError,
  validateRevisionModels,
  validateTextPreservation
} from './revision-validation';
import { readDocx } from './validate-docx';

export interface EditSpan {
  readonly id: string;
  readonly text: string;
}
export interface EditChunk {
  readonly id: string;
  readonly spans: readonly EditSpan[];
}
export interface EditProvider {
  edit(system: string, chunk: EditChunk, signal?: AbortSignal): Promise<unknown>;
}
interface SourceSpan extends EditSpan {
  readonly source: DocxSource;
  readonly offset: number;
  readonly contentStart: number;
}

function sourceSpans(document: DocxDocument): SourceSpan[] {
  return paragraphs(document.blocks).flatMap((paragraph) =>
    paragraph.inlines.flatMap((inline) => {
      if (inline.kind !== 'run') return [];
      return inline.textNodes.flatMap((node) => {
        const spans: SourceSpan[] = [];
        let offset = 0;
        while (offset < node.text.length) {
          let end = Math.min(offset + 1600, node.text.length);
          if (end < node.text.length) {
            const space = node.text.lastIndexOf(' ', end - 1);
            if (space > offset) end = space + 1;
            else if (/[\uD800-\uDBFF]/.test(node.text[end - 1])) end--;
          }
          spans.push({
            id: `${node.source.start}:${offset}`,
            text: node.text.slice(offset, end),
            source: node.source,
            contentStart: node.contentStart,
            offset
          });
          offset = end;
        }
        return spans;
      });
    })
  );
}

export function planDocxEdits(document: DocxDocument): readonly EditChunk[] {
  const chunks: EditChunk[] = [];
  let spans: EditSpan[] = [];
  let length = 0;
  const append = () => {
    if (!spans.length) return;
    const id = createHash('sha256')
      .update('docx-edit-v1\n')
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

export function validateChunkResult(chunk: EditChunk, raw: unknown): readonly EditSpan[] {
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
    const text = edit.text;
    requirePreserved(
      text.length <= source.text.length * 2 + 200 &&
        [...text].every((character) => {
          const code = character.codePointAt(0);
          return (code >= 32 || [9, 10, 13].includes(code)) && ![65534, 65535].includes(code);
        }) &&
        !/[\uD800-\uDFFF]/u.test(text),
      'response'
    );
    requirePreserved(
      /^\s*/.exec(text)[0] === /^\s*/.exec(source.text)[0] && /\s*$/.exec(text)[0] === /\s*$/.exec(source.text)[0],
      'formatting'
    );
    validateTextPreservation(source.text, text);
    return { id: source.id, text };
  });
}

export async function constructRevisedDocx(
  document: DocxDocument,
  results: ReadonlyMap<string, readonly EditSpan[]>
): Promise<Buffer> {
  const plan = planDocxEdits(document);
  requirePreserved(results.size === plan.length, 'response');
  const edits = new Map(
    plan
      .flatMap((chunk) => validateChunkResult(chunk, { edits: results.get(chunk.id) }))
      .map((span) => [span.id, span.text])
  );
  const nodes = new Map<number, { source: DocxSource; contentStart: number; text: string }>();
  for (const span of sourceSpans(document)) {
    const node = nodes.get(span.source.start) ?? { source: span.source, contentStart: span.contentStart, text: '' };
    node.text += edits.get(span.id);
    nodes.set(span.source.start, node);
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
  return bytes;
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
