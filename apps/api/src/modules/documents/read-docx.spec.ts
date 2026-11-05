import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { docxFixtureCases } from '@api/shared/testing/docx-fixture-catalog';
import { describe, expect, it } from 'vitest';
import { docxFixture } from '@api/shared/testing/docx-fixture';
import { languageSamples } from '@api/shared/testing/docx-language-fixtures';
import { readerFixture } from '@api/shared/testing/docx-reader-fixture';
import { readDocx } from './validate-docx';

const documentXml = (body: string) =>
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('DOCX reader', () => {
  it('returns headings, paragraphs, list items, table cells and runs in reading order', async () => {
    const bytes = await readerFixture(`
      <w:p><w:pPr><w:pStyle w:val="ResearchTitle"/></w:pPr><w:r><w:t>Research findings</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">The study </w:t></w:r><w:hyperlink r:id="link"><w:r><w:rPr><w:i/></w:rPr><w:t>supports this conclusion.</w:t></w:r></w:hyperlink></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First observation</w:t></w:r></w:p>
      <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Résultats de la recherche</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`);
    const result = await readDocx(bytes);
    expect(result.blocks).toMatchObject([
      { kind: 'heading', level: 1, text: 'Research findings' },
      {
        kind: 'paragraph',
        text: 'The study supports this conclusion.',
        inlines: [
          { kind: 'run', text: 'The study ', bold: true, italic: false },
          {
            kind: 'run',
            text: 'supports this conclusion.',
            bold: false,
            italic: true,
            hyperlink: { target: 'https://example.org/research?a=1&b=2' }
          }
        ]
      },
      { kind: 'list-item', numbering: { id: '1', level: 0 }, text: 'First observation' },
      { kind: 'table', rows: [{ cells: [{ blocks: [{ kind: 'paragraph', text: 'Résultats de la recherche' }] }] }] }
    ]);
    expect(result.text).toBe(
      'Research findings\nThe study supports this conclusion.\nFirst observation\nRésultats de la recherche'
    );
    expect(Object.isFrozen(result.blocks)).toBe(true);
    expect(Object.isFrozen(result.blocks[1])).toBe(true);
  });
  it('protects drawings, equations, fields, note references and all other package parts byte for byte', async () => {
    const bytes = await readerFixture(`<w:p><w:r><w:t>Evidence</w:t></w:r>
      <w:r><w:drawing><a:blip r:embed="image"/></w:drawing></w:r>
      <m:oMath><m:r><m:t>x=2</m:t></m:r></m:oMath>
      <w:fldSimple w:instr=" REF Source "><w:r><w:t>Reference one</w:t></w:r></w:fldSimple>
      <w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:endnoteReference w:id="1"/></w:r><w:r><w:commentReference w:id="0"/></w:r></w:p>
      <w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> REF Source </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Reference two</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
    const result = await readDocx(bytes);
    expect(result.blocks[0]).toMatchObject({
      inlines: [
        { kind: 'run', text: 'Evidence' },
        { kind: 'protected', reason: 'image' },
        { kind: 'protected', reason: 'equation' },
        { kind: 'protected', reason: 'reference-field', text: 'Reference one' },
        { kind: 'protected', reason: 'footnote' },
        { kind: 'protected', reason: 'endnote' },
        { kind: 'protected', reason: 'comment' }
      ]
    });
    expect(result.blocks[1]).toMatchObject({
      inlines: [{ kind: 'protected', reason: 'reference-field', text: 'Reference two' }]
    });
    for (const name of ['footnotes', 'endnotes', 'comments', 'header1', 'footer1', 'styles', 'numbering']) {
      expect(result.protectedParts).toContainEqual(
        expect.objectContaining({ name: `word/${name}.xml`, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
      );
      const original = result.readPart(`word/${name}.xml`);
      const copy = result.readPart(`word/${name}.xml`);
      copy.fill(0);
      expect(result.readPart(`word/${name}.xml`)).toEqual(original);
    }
    const paragraph = result.blocks[0];
    if (paragraph.kind === 'table' || paragraph.kind === 'protected') throw new Error('Expected paragraph');
    const image = paragraph.inlines[1];
    expect(result.readPart(result.mainPart).toString('utf8').slice(image.source.start, image.source.end)).toBe(
      '<w:r><w:drawing><a:blip r:embed="image"/></w:drawing></w:r>'
    );
  });

  it.each([
    ['<w:ins w:id="1"><w:r><w:t>Inserted text</w:t></w:r></w:ins>', 'accept or reject'],
    ['<w:pPr><w:pPrChange w:id="1"><w:pPr/></w:pPrChange></w:pPr>', 'accept or reject'],
    ['<w:moveFrom w:id="1"><w:r><w:t>Moved text</w:t></w:r></w:moveFrom>', 'accept or reject'],
    ['<w:r><w:pict><w:txbxContent><w:p/></w:txbxContent></w:pict></w:r>', 'text boxes'],
    ['<w:sdt><w:sdtContent><w:r><w:t>Controlled text</w:t></w:r></w:sdtContent></w:sdt>', 'content controls'],
    ['<w:r><w:object/></w:r>', 'embedded objects'],
    ['<w:altChunk r:id="html"/>', 'imported content']
  ])('rejects unsupported content %s with instructions', async (content, reason) => {
    await expect(readDocx(await readerFixture(`<w:p>${content}</w:p>`))).rejects.toThrow(reason);
  });

  it('also rejects changes and unsupported structures inside preserved parts', async () => {
    await expect(
      readDocx(
        await readerFixture(paragraph('Essay'), {
          'word/header1.xml':
            '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:del w:id="1"/></w:p></w:hdr>'
        })
      )
    ).rejects.toThrow('accept or reject');
  });

  it('explains encrypted Office files and bounds archive expansion', async () => {
    await expect(readDocx(Buffer.from('d0cf11e0a1b11ae100000000', 'hex'))).rejects.toThrow('password');
    const encrypted = Buffer.from(await docxFixture({}, undefined, true));
    encrypted.writeUInt16LE(1, encrypted.indexOf(Buffer.from('504b0102', 'hex')) + 8);
    await expect(readDocx(encrypted)).rejects.toThrow('password');
    await expect(
      readDocx(await docxFixture({ 'word/media/bomb.bin': Buffer.alloc(20000001) }, undefined, true))
    ).rejects.toThrow('safe archive limits');
    await expect(readDocx(Buffer.from('damaged'))).rejects.toThrow('damaged');
  });

  it.each(['english', 'french'] as const)(
    'accepts a %s essay and mixed English/French without changing text',
    async (language) => {
      const result = await readDocx(await readerFixture(paragraph(languageSamples[language])));
      expect(result.text).toBe(languageSamples[language]);
      expect(result.language.status).toBe('supported');
      const mixed = await readDocx(
        await readerFixture(paragraph(languageSamples.english) + paragraph(languageSamples.french))
      );
      expect(mixed.language.languages).toEqual(['en', 'fr']);
    }
  );

  it.each(['spanish', 'german', 'russian', 'chinese'] as const)(
    'rejects clearly unsupported %s prose',
    async (language) => {
      await expect(readDocx(await readerFixture(paragraph(languageSamples[language])))).rejects.toThrow(
        'English or French'
      );
    }
  );

  it.each(['Bonjour', 'Hola mundo', '研究結果', 'Quasar neutrino boson isotope theorem matrix eigenvalue'])(
    'keeps short or uncertain text unclassified: %s',
    async (text) => {
      const result = await readDocx(await readerFixture(paragraph(text)));
      expect(result.language).toEqual({ status: 'uncertain', languages: [] });
    }
  );

  it('reads CDATA and UTF-16 XML without losing text or source locations', async () => {
    const xml = documentXml('<w:p><w:r><w:t><![CDATA[Research & evidence]]></w:t></w:r></w:p>');
    const result = await readDocx(
      await docxFixture({ 'word/document.xml': Buffer.concat([Buffer.from([255, 254]), Buffer.from(xml, 'utf16le')]) })
    );
    expect(result.text).toBe('Research & evidence');
    expect(result.wordCount).toBe(2);
    expect(result.readXmlPart(result.mainPart).slice(result.blocks[0].source.start, result.blocks[0].source.end)).toBe(
      '<w:p><w:r><w:t><![CDATA[Research & evidence]]></w:t></w:r></w:p>'
    );
  });

  it('retains block equations and nested tables and rejects unmodeled body structures', async () => {
    const result = await readDocx(
      await readerFixture(
        '<m:oMathPara><m:oMath><m:r><m:t>x=2</m:t></m:r></m:oMath></m:oMathPara><w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc>' +
          paragraph('Nested finding') +
          '</w:tc></w:tr></w:tbl>' +
          paragraph('Cell conclusion') +
          '</w:tc></w:tr></w:tbl>'
      )
    );
    expect(result.blocks[0]).toMatchObject({ kind: 'protected', reason: 'equation' });
    expect(result.text).toContain('Nested finding\nCell conclusion');
    await expect(
      readDocx(await readerFixture('<w:customXml>' + paragraph('Hidden from model') + '</w:customXml>'))
    ).rejects.toThrow('customXml');
  });

  it('rejects broken hyperlink relationships instead of silently dropping their targets', async () => {
    await expect(
      readDocx(
        await readerFixture('<w:p><w:hyperlink r:id="missing"><w:r><w:t>Evidence</w:t></w:r></w:hyperlink></w:p>')
      )
    ).rejects.toThrow('hyperlink');
  });

  it('rejects extreme compression ratios even below the absolute expansion limit', async () => {
    const bytes = await docxFixture({ 'word/media/bomb.bin': Buffer.alloc(1500000) }, undefined, true);
    await expect(readDocx(bytes)).rejects.toThrow('safe archive limits');
  });

  it('does not lose visible punctuation, nonbreaking hyphens, tabs or line breaks', async () => {
    const result = await readDocx(
      await readerFixture(
        '<w:p><w:r><w:t>well</w:t><w:noBreakHyphen/><w:t>known</w:t><w:tab/><w:t>finding</w:t><w:br/><w:t>confirmed</w:t></w:r></w:p>'
      )
    );
    expect(result.text).toBe('well‑known\tfinding\nconfirmed');
  });

  it('exposes exact editable text locations while retaining inherited and explicit run formatting', async () => {
    const result = await readDocx(
      await readerFixture(
        '<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>Bold</w:t><w:tab/><w:t>text</w:t></w:r><w:r><w:rPr><w:b w:val="false"/><w:i/></w:rPr><w:t>plain italic</w:t></w:r></w:p>',
        {
          'word/styles.xml':
            '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Body"><w:rPr><w:b/></w:rPr></w:style></w:styles>'
        }
      )
    );
    const block = result.blocks[0];
    if (block.kind === 'table' || block.kind === 'protected') throw new Error('Expected paragraph');
    expect(block.inlines).toMatchObject([
      { kind: 'run', bold: true, italic: false, textNodes: [{ text: 'Bold' }, { text: 'text' }] },
      { kind: 'run', bold: false, italic: true }
    ]);
    const run = block.inlines[0];
    if (run.kind !== 'run') throw new Error('Expected editable run');
    const location = run.textNodes[0].source;
    expect(result.readXmlPart(location.part).slice(location.start, location.end)).toBe('<w:t>Bold</w:t>');
  });

  it.each(docxFixtureCases)('checks the committed $name upload fixture', async ({ name, rejection }) => {
    const bytes = await readFile(join(__dirname, `../../shared/testing/fixtures/docx/${name}.docx`));
    if (rejection) await expect(readDocx(bytes)).rejects.toThrow(rejection);
    else expect((await readDocx(bytes)).wordCount).toBeGreaterThan(0);
  });

  it('bounds XML node counts and cyclic style inheritance', async () => {
    await expect(
      readDocx(
        await docxFixture(
          { 'word/document.xml': documentXml('<w:p>'.repeat(1) + '<w:r/>'.repeat(100001) + '</w:p>') },
          undefined,
          true
        )
      )
    ).rejects.toThrow('safe archive limits');
    await expect(
      readDocx(
        await readerFixture('<w:p><w:pPr><w:pStyle w:val="Loop"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>', {
          'word/styles.xml':
            '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Loop"><w:basedOn w:val="Loop"/></w:style></w:styles>'
        })
      )
    ).rejects.toThrow('style');
  });

  it.each([
    '<w:tblGridChange w:id="1"><w:tblGrid/></w:tblGridChange>',
    '<w:tblPrExChange w:id="1"><w:tblPrEx/></w:tblPrExChange>',
    '<w14:conflictIns xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" w:id="1"><w:r><w:t>Conflict</w:t></w:r></w14:conflictIns>'
  ])('rejects less common tracked revisions: %s', async (revision) => {
    await expect(readDocx(await readerFixture('<w:p>' + revision + '</w:p>'))).rejects.toThrow('accept or reject');
  });

  it('counts words across runs and accepts exactly 10,000 but rejects 10,001 with the count', async () => {
    const bytes = await docxFixture({ 'word/document.xml': documentXml(paragraph('word '.repeat(10000))) });
    expect((await readDocx(bytes)).wordCount).toBe(10000);
    const oversized = await docxFixture({ 'word/document.xml': documentXml(paragraph('word '.repeat(10001))) });
    await expect(readDocx(oversized)).rejects.toThrow('10,001 words. The limit is 10,000');
    const split = await docxFixture({
      'word/document.xml': documentXml('<w:p><w:r><w:t>hel</w:t></w:r><w:r><w:t>lo world</w:t></w:r></w:p>')
    });
    expect((await readDocx(split)).wordCount).toBe(2);
  });
});
