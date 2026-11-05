import { docxFixture } from './docx-fixture';

export const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const wrapDocument = (body: string) =>
  `<w:document xmlns:w="${wordNamespace}" xmlns:r="${relationshipNamespace}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/></w:sectPr></w:body></w:document>`;
export const textParagraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export function readerFixture(body: string, overrides: Record<string, string | Buffer | null> = {}) {
  const xmlParts = {
    'word/document.xml': wrapDocument(body),
    'word/styles.xml': `<w:styles xmlns:w="${wordNamespace}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ResearchTitle"><w:basedOn w:val="Heading1"/></w:style></w:styles>`,
    'word/numbering.xml': `<w:numbering xmlns:w="${wordNamespace}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/footnotes.xml': `<w:footnotes xmlns:w="${wordNamespace}"><w:footnote w:id="1">${textParagraph('Footnote evidence stays unchanged.')}</w:footnote></w:footnotes>`,
    'word/endnotes.xml': `<w:endnotes xmlns:w="${wordNamespace}"><w:endnote w:id="1">${textParagraph('Endnote evidence stays unchanged.')}</w:endnote></w:endnotes>`,
    'word/comments.xml': `<w:comments xmlns:w="${wordNamespace}"><w:comment w:id="0" w:author="Tutor">${textParagraph('Keep this quotation.')}</w:comment></w:comments>`,
    'word/header1.xml': `<w:hdr xmlns:w="${wordNamespace}">${textParagraph('Research paper')}</w:hdr>`,
    'word/footer1.xml': `<w:ftr xmlns:w="${wordNamespace}">${textParagraph('Student draft')}</w:ftr>`
  };
  const contentTypes: Record<string, string> = {
    document: 'document.main',
    styles: 'styles',
    numbering: 'numbering',
    footnotes: 'footnotes',
    endnotes: 'endnotes',
    comments: 'comments',
    header1: 'header',
    footer1: 'footer'
  };
  return docxFixture(
    {
      ...xmlParts,
      '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${Object.entries(
        contentTypes
      )
        .map(
          ([name, type]) =>
            `<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`
        )
        .join('')}</Types>`,
      'word/_rels/document.xml.rels': `<Relationships xmlns="${packageNamespace}">${Object.entries({
        styles: 'styles.xml',
        numbering: 'numbering.xml',
        footnotes: 'footnotes.xml',
        endnotes: 'endnotes.xml',
        comments: 'comments.xml',
        header: 'header1.xml',
        footer: 'footer1.xml',
        image: 'media/image.png'
      })
        .map(
          ([type, target]) => `<Relationship Id="${type}" Type="${relationshipNamespace}/${type}" Target="${target}"/>`
        )
        .join(
          ''
        )}<Relationship Id="link" Type="${relationshipNamespace}/hyperlink" Target="https://example.org/research?a=1&amp;b=2" TargetMode="External"/></Relationships>`,
      'word/media/image.png': Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64'
      ),
      ...overrides
    },
    undefined,
    true
  );
}
