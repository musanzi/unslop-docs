import { ZipFile } from 'yazl';

export async function docxFixture(
  overrides: Record<string, string | Buffer | null> = {},
  size?: number,
  compress = false
): Promise<Buffer> {
  const parts = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Private student text.</w:t></w:r></w:p></w:body></w:document>',
    ...overrides
  };
  async function zip(padding?: number): Promise<Buffer> {
    const archive = new ZipFile();
    for (const [name, content] of Object.entries(parts)) {
      if (content !== null)
        archive.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name, { compress });
    }
    if (padding !== undefined) archive.addBuffer(Buffer.alloc(padding), 'word/media/padding.bin', { compress });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      archive.outputStream.on('data', (chunk) => chunks.push(chunk));
      archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      archive.outputStream.on('error', reject);
    });
    archive.end();
    return finished;
  }
  return size === undefined ? zip() : zip(size - (await zip(0)).length);
}
