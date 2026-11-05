import { docxFixture } from './docx-fixture';
import { readerFixture, textParagraph } from './docx-reader-fixture';
import { languageSamples } from './docx-language-fixtures';

function essay(language: 'english' | 'french') {
  const title = language === 'english' ? 'River study' : 'Étude de la rivière';
  const observation = language === 'english' ? 'Water samples' : 'Échantillons d’eau';
  return `<w:p><w:pPr><w:pStyle w:val="ResearchTitle"/></w:pPr><w:r><w:t>${title}</w:t></w:r></w:p>
    ${textParagraph(languageSamples[language])}
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${observation}: </w:t></w:r><w:hyperlink r:id="link"><w:r><w:rPr><w:i/></w:rPr><w:t>2026</w:t></w:r></w:hyperlink></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${observation}</w:t></w:r></w:p>
    <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc>${textParagraph(observation)}</w:tc><w:tc>${textParagraph('12')}</w:tc></w:tr></w:tbl>`;
}

const preserved = `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Sample image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Sample image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  <w:p><m:oMath><m:r><m:t>x = 2</m:t></m:r></m:oMath></w:p>
  <w:p><w:bookmarkStart w:id="0" w:name="Observation"/><w:r><w:t>Observation</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>
  <w:p><w:fldSimple w:instr=" REF Observation "><w:r><w:t>Observation</w:t></w:r></w:fldSimple><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>
  <w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Quoted evidence.</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`;

export const docxFixtureCases: readonly { name: string; rejection?: string; create: () => Promise<Buffer> }[] = [
  { name: 'english-structures', create: () => readerFixture(essay('english') + preserved) },
  { name: 'french-structures', create: () => readerFixture(essay('french') + preserved) },
  { name: 'mixed-structures', create: () => readerFixture(essay('english') + essay('french') + preserved) },
  { name: 'short-uncertain', create: () => readerFixture(textParagraph('Bonjour, monde.')) },
  { name: 'exactly-10000-words', create: () => readerFixture(textParagraph('word '.repeat(10000))) },
  { name: 'over-10000-words', rejection: '10,001', create: () => readerFixture(textParagraph('word '.repeat(10001))) },
  {
    name: 'tracked-changes',
    create: () =>
      readerFixture(
        essay('english') +
          '<w:p><w:ins w:id="1" w:author="Tutor" w:date="2026-01-01T00:00:00Z"><w:r><w:t>New finding</w:t></w:r></w:ins></w:p>'
      )
  },
  {
    name: 'text-box',
    create: () =>
      readerFixture(
        '<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" id="box" style="width:100pt;height:50pt"><v:textbox><w:txbxContent>' +
          textParagraph('Boxed text') +
          '</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>'
      )
  },
  {
    name: 'content-control',
    create: () =>
      readerFixture(
        '<w:sdt><w:sdtPr><w:alias w:val="Student name"/><w:tag w:val="student"/></w:sdtPr><w:sdtContent>' +
          textParagraph('Student') +
          '</w:sdtContent></w:sdt>'
      )
  },
  {
    name: 'embedded-object',
    rejection: 'embedded objects',
    create: () =>
      readerFixture(
        '<w:p><w:r><w:object><o:OLEObject xmlns:o="urn:schemas-microsoft-com:office:office" Type="Embed" ProgID="Excel.Sheet.12" r:id="object"/></w:object></w:r></w:p>'
      )
  },
  ...(['spanish', 'german', 'russian', 'chinese'] as const).map((language) => ({
    name: `unsupported-${language}`,
    rejection: 'English or French',
    create: () => readerFixture(textParagraph(languageSamples[language]))
  })),
  {
    name: 'encrypted-zip',
    rejection: 'password',
    create: async () => {
      const bytes = await readerFixture(essay('english'));
      const offset = bytes.indexOf(Buffer.from('504b0102', 'hex')) + 8;
      bytes.writeUInt16LE(bytes.readUInt16LE(offset) | 1, offset);
      return bytes;
    }
  },
  {
    name: 'encrypted-office-signature',
    rejection: 'password',
    create: async () => Buffer.from('d0cf11e0a1b11ae100000000', 'hex')
  },
  {
    name: 'corrupt',
    rejection: 'damaged',
    create: async () => (await readerFixture(essay('french'))).subarray(0, 100)
  },
  {
    name: 'zip-bomb',
    rejection: 'safe archive limits',
    create: () => docxFixture({ 'word/media/bomb.bin': Buffer.alloc(20000001) }, undefined, true)
  }
];
