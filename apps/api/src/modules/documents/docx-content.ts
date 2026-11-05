import { BadRequestException } from '@nestjs/common';
import { SaxesAttributeNS } from 'saxes';
import { posix } from 'node:path';
import { DocxBlock, DocxParagraph, DocxRun, DocxProtected } from './docx-model';

const wordUris = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main'
];
const relationshipUris = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'
];

export interface XmlNode {
  local: string;
  uri: string;
  attributes: SaxesAttributeNS[];
  children: XmlNode[];
  text: string;
  start: number;
  contentStart: number;
  end: number;
}

function isWord(node: XmlNode, name?: string) {
  return wordUris.includes(node.uri) && (!name || node.local === name);
}
function child(node: XmlNode | undefined, name: string) {
  return node?.children.find((item) => isWord(item, name));
}
function attr(node: XmlNode | undefined, name: string, namespaces = wordUris) {
  return node?.attributes.find((item) => item.local === name && namespaces.includes(item.uri))?.value;
}
function textOf(node: XmlNode): string {
  if (isWord(node, 't')) return node.text;
  if (isWord(node, 'noBreakHyphen')) return '\u2011';
  if (isWord(node, 'softHyphen')) return '\u00ad';
  if (isWord(node, 'tab')) return '\t';
  if (isWord(node, 'br') || isWord(node, 'cr')) return '\n';
  return node.children.map(textOf).join('');
}
export function freezeModel<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeModel(child);
    Object.freeze(value);
  }
  return value;
}

export function documentModel(mainPart: string, trees: Map<string, XmlNode>) {
  const main = trees.get(mainPart);
  const source = (node: XmlNode) => ({ part: mainPart, start: node.start, end: node.end });
  const relsName = posix.join(posix.dirname(mainPart), '_rels', `${posix.basename(mainPart)}.rels`);
  const relationships = trees.get(relsName)?.children ?? [];
  const related = (kind: string) => {
    const rel = relationships.find((node) =>
      relationshipUris.some((uri) => attr(node, 'Type', ['']) === `${uri}/${kind}`)
    );
    const target = attr(rel, 'Target', ['']);
    return target ? trees.get(posix.join(posix.dirname(mainPart), target)) : undefined;
  };
  const styles = related('styles');
  const stylesById = new Map(
    styles?.children.filter((node) => isWord(node, 'style')).map((node) => [attr(node, 'styleId'), node])
  );
  const resolvedStyles = new Map<string, XmlNode[]>();
  const styleProperties = (id: string | undefined, visited = new Set<string>()): XmlNode[] => {
    if (!id) return [];
    if (visited.has(id) || visited.size >= 128)
      throw new BadRequestException(
        'This DOCX has damaged or excessively nested styles. Repair the styles in Word and upload again.'
      );
    const cached = resolvedStyles.get(id);
    if (cached) return cached;
    visited.add(id);
    const style = stylesById.get(id);
    const result = style ? [...styleProperties(attr(child(style, 'basedOn'), 'val'), visited), style] : [];
    resolvedStyles.set(id, result);
    return result;
  };
  const enabled = (node: XmlNode | undefined) => !!node && !['0', 'false', 'off'].includes(attr(node, 'val'));
  let fieldDepth = 0;
  const protectedReason = (node: XmlNode): string | undefined => {
    if (node.uri.endsWith('/math')) return 'equation';
    if (isWord(node)) {
      const reasons: Record<string, string> = {
        drawing: 'image',
        pict: 'image',
        fldSimple: 'reference-field',
        footnoteReference: 'footnote',
        endnoteReference: 'endnote',
        commentReference: 'comment'
      };
      if (reasons[node.local]) return reasons[node.local];
    }
    return node.children.map(protectedReason).find(Boolean);
  };
  const paragraph = (node: XmlNode): DocxParagraph => {
    const properties = child(node, 'pPr');
    const style = attr(child(properties, 'pStyle'), 'val');
    const inherited = styleProperties(style);
    const paragraphProperties = [...inherited.map((item) => child(item, 'pPr')), properties].filter(Boolean);
    const outline = paragraphProperties
      .map((item) => attr(child(item, 'outlineLvl'), 'val'))
      .filter((value) => value !== undefined)
      .at(-1);
    const numPr = paragraphProperties
      .map((item) => child(item, 'numPr'))
      .filter(Boolean)
      .at(-1);
    const numId = attr(child(numPr, 'numId'), 'val');
    const inlines: (DocxRun | DocxProtected)[] = [];
    let hasField = fieldDepth > 0;
    const scanFields = (item: XmlNode) => {
      if (isWord(item, 'fldChar')) {
        hasField = true;
        const type = attr(item, 'fldCharType');
        if (type === 'begin') fieldDepth++;
        else if (type === 'end') fieldDepth--;
        else if (type !== 'separate' || !fieldDepth)
          throw new BadRequestException(
            'This DOCX has a damaged reference field. Repair the field in Word and upload again.'
          );
        if (fieldDepth < 0)
          throw new BadRequestException(
            'This DOCX has a damaged reference field. Repair the field in Word and upload again.'
          );
      }
      item.children.forEach(scanFields);
    };
    scanFields(node);
    const visit = (item: XmlNode, hyperlink?: DocxRun['hyperlink']) => {
      if (isWord(item, 'hyperlink')) {
        const id = attr(item, 'id', relationshipUris);
        const rel = relationships.find((node) => attr(node, 'Id', ['']) === id);
        if (
          id &&
          (!rel ||
            !relationshipUris.some((uri) => attr(rel, 'Type', ['']) === `${uri}/hyperlink`) ||
            !attr(rel, 'Target', ['']))
        )
          throw new BadRequestException(
            'This DOCX has a damaged hyperlink. Repair or remove the hyperlink and upload again.'
          );
        hyperlink = { target: attr(rel, 'Target', ['']), anchor: attr(item, 'anchor') };
      }
      const reason = protectedReason(item);
      if (reason && !isWord(item, 'hyperlink')) {
        inlines.push({ kind: 'protected', reason, source: source(item), text: textOf(item) });
        return;
      }
      if (isWord(item, 'r')) {
        const rPr = child(item, 'rPr');
        const inheritedRuns = [...inherited, ...styleProperties(attr(child(rPr, 'rStyle'), 'val'))].map((item) =>
          child(item, 'rPr')
        );
        const property = (name: string) =>
          [...inheritedRuns, rPr]
            .map((item) => child(item, name))
            .filter(Boolean)
            .at(-1);
        inlines.push({
          kind: 'run',
          textNodes: item.children
            .filter((node) => isWord(node, 't'))
            .map((node) => ({ source: source(node), contentStart: node.contentStart, text: node.text })),
          source: source(item),
          text: textOf(item),
          bold: enabled(property('b')),
          italic: enabled(property('i')),
          ...(hyperlink ? { hyperlink } : {})
        });
        return;
      }
      for (const nested of item.children) visit(nested, hyperlink);
    };
    if (hasField)
      inlines.push({ kind: 'protected', reason: 'reference-field', source: source(node), text: textOf(node) });
    else for (const item of node.children) if (!isWord(item, 'pPr')) visit(item);
    const level = outline !== undefined && Number(outline) < 9 ? Number(outline) + 1 : undefined;
    const numbering =
      numId && numId !== '0' ? { id: numId, level: Number(attr(child(numPr, 'ilvl'), 'val') ?? 0) } : undefined;
    return {
      kind: level ? 'heading' : numbering ? 'list-item' : 'paragraph',
      source: source(node),
      style,
      level,
      numbering,
      inlines,
      text: inlines.map((item) => item.text).join('')
    };
  };
  const blocks = (parent: XmlNode): DocxBlock[] =>
    parent.children.flatMap((node): DocxBlock[] => {
      if (isWord(node, 'p')) return [paragraph(node)];
      if (isWord(node, 'tbl'))
        return [
          {
            kind: 'table',
            source: source(node),
            rows: node.children
              .filter((item) => isWord(item, 'tr'))
              .map((row) => ({
                source: source(row),
                cells: row.children
                  .filter((item) => isWord(item, 'tc'))
                  .map((cell) => ({ source: source(cell), blocks: blocks(cell) }))
              }))
          }
        ];
      if (
        ['sectPr', 'tcPr', 'bookmarkStart', 'bookmarkEnd', 'proofErr', 'permStart', 'permEnd'].some((name) =>
          isWord(node, name)
        )
      )
        return [];
      const reason = protectedReason(node);
      if (reason) return [{ kind: 'protected', reason, source: source(node), text: textOf(node) }];
      throw new BadRequestException(
        `This DOCX contains an unsupported structure (${node.local}). Convert it to ordinary paragraphs or images and upload again.`
      );
    });
  const result = blocks(child(main, 'body'));
  if (fieldDepth)
    throw new BadRequestException(
      'This DOCX has an unfinished reference field. Repair the field in Word and upload again.'
    );
  const orderedText = (items: DocxBlock[]): string =>
    items
      .map((item) =>
        item.kind === 'table'
          ? item.rows.map((row) => row.cells.map((cell) => orderedText([...cell.blocks])).join('\n')).join('\n')
          : item.text
      )
      .join('\n');
  return { blocks: result, text: orderedText(result) };
}
