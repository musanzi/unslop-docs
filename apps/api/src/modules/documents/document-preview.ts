import { DocxBlock, DocxDocument, DocxParagraph } from './docx-model';

export interface PreviewInline {
  text: string;
  bold: boolean;
  italic: boolean;
  protected: string | null;
}

export interface PreviewCell {
  blocks: PreviewBlock[];
}

export interface PreviewRow {
  cells: PreviewCell[];
}

export interface PreviewBlock {
  kind: 'heading' | 'paragraph' | 'list-item' | 'table' | 'protected';
  level: number | null;
  text: string | null;
  inlines: PreviewInline[] | null;
  rows: PreviewRow[] | null;
  reason: string | null;
}

export interface DocumentPreview {
  blocks: PreviewBlock[];
}

function paragraphBlock(paragraph: DocxParagraph): PreviewBlock {
  return {
    kind: paragraph.kind,
    level: paragraph.kind === 'heading' ? paragraph.level : paragraph.numbering ? paragraph.numbering.level + 1 : null,
    text: paragraph.text,
    inlines: paragraph.inlines.map((inline) =>
      inline.kind === 'run'
        ? { text: inline.text, bold: inline.bold, italic: inline.italic, protected: null }
        : { text: inline.text, bold: false, italic: false, protected: inline.reason }
    ),
    rows: null,
    reason: null
  };
}

function previewBlocks(blocks: readonly DocxBlock[]): PreviewBlock[] {
  return blocks.map((block) => {
    if (block.kind === 'table')
      return {
        kind: 'table',
        level: null,
        text: null,
        inlines: null,
        rows: block.rows.map((row) => ({ cells: row.cells.map((cell) => ({ blocks: previewBlocks(cell.blocks) })) })),
        reason: null
      };
    if (block.kind === 'protected')
      return { kind: 'protected', level: null, text: block.text, inlines: null, rows: null, reason: block.reason };
    return paragraphBlock(block);
  });
}

export function documentPreview(document: DocxDocument): DocumentPreview {
  return { blocks: previewBlocks(document.blocks) };
}
