import { describe, expect, it } from 'vitest';
import { docxFixtureCases } from '@api/shared/testing/docx-fixture-catalog';
import { readDocx } from './validate-docx';
import { documentPreview, PreviewBlock } from './document-preview';

async function preview(name: string): Promise<PreviewBlock[]> {
  const bytes = await docxFixtureCases.find((fixture) => fixture.name === name).create();
  return documentPreview(await readDocx(bytes)).blocks;
}

describe('Read-only document preview', () => {
  it('projects headings, formatted runs, list levels, tables and protected elements in document order', async () => {
    const blocks = await preview('english-structures');
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, text: 'River study', rows: null, reason: null });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', level: null });
    expect(blocks[2]).toMatchObject({
      kind: 'paragraph',
      text: 'Water samples: 2026',
      inlines: [
        { text: 'Water samples: ', bold: true, italic: false, protected: null },
        { text: '2026', bold: false, italic: true, protected: null }
      ]
    });
    expect(blocks[3]).toMatchObject({ kind: 'list-item', level: 1, text: 'Water samples' });
    expect(blocks[4]).toMatchObject({
      kind: 'table',
      text: null,
      inlines: null,
      rows: [
        {
          cells: [
            { blocks: [{ kind: 'paragraph', text: 'Water samples' }] },
            { blocks: [{ kind: 'paragraph', text: '12' }] }
          ]
        }
      ]
    });
    const protectedKinds = blocks
      .slice(5)
      .flatMap((block) => [block.reason, ...(block.inlines ?? []).map((inline) => inline.protected)])
      .filter(Boolean);
    expect(protectedKinds).toEqual(
      expect.arrayContaining(['image', 'equation', 'reference-field', 'footnote', 'endnote', 'comment'])
    );
    expect(
      blocks.every((block) => ['heading', 'paragraph', 'list-item', 'table', 'protected'].includes(block.kind))
    ).toBe(true);
  });

  it('shows the final version of tracked changes and the visible text of content controls', async () => {
    const texts = (await preview('tracked-changes-final-version')).map((block) => block.text).join('\n');
    expect(texts).not.toMatch(/<w:|w:del/);
    const controlled = (await preview('english-content-controls')).map((block) => block.text).join('\n');
    expect(controlled).toContain('River study');
  });
});
