import { BadRequestException } from '@nestjs/common';
import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';
import { SaxesParser } from 'saxes';

const contentTypesNamespace = 'http://schemas.openxmlformats.org/package/2006/content-types';
const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const wordNamespaces = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main'
]);
const officeRelationships = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument'
]);
const mainContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

function inspectXml(bytes: Buffer) {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let root = '';
  let namespace = '';
  let body = false;
  const overrides = new Map<string, string>();
  const targets: string[] = [];
  parser.on('doctype', () => {
    throw new Error('Document types are not allowed');
  });
  parser.on('opentag', (tag) => {
    if (++depth > 128) throw new Error('XML nesting exceeds limit');
    if (depth === 1) {
      root = tag.local;
      namespace = tag.uri;
    }
    if (depth === 2 && tag.local === 'body' && wordNamespaces.has(tag.uri)) body = true;
    if (depth === 2 && tag.local === 'Override' && tag.uri === contentTypesNamespace) {
      const part = tag.attributes.PartName?.value;
      if (!part || overrides.has(part)) throw new Error('Invalid content type');
      overrides.set(part, tag.attributes.ContentType?.value);
    }
    if (
      depth === 2 &&
      tag.local === 'Relationship' &&
      tag.uri === relationshipsNamespace &&
      officeRelationships.has(tag.attributes.Type?.value)
    ) {
      if (tag.attributes.TargetMode?.value === 'External') throw new Error('External main document');
      targets.push(tag.attributes.Target?.value);
    }
  });
  parser.on('closetag', () => {
    depth--;
  });
  parser.write(new TextDecoder(encoding, { fatal: true }).decode(bytes)).close();
  return { root, namespace, body, overrides, targets };
}

export async function validateDocx(bytes: Buffer): Promise<void> {
  try {
    const zip = await fromBufferPromise(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
    try {
      if (zip.entryCount > 2048) throw new Error('Too many archive entries');
      const names = new Set<string>();
      const xml = new Map<string, ReturnType<typeof inspectXml>>();
      let total = 0;
      for await (const entry of zip.eachEntry()) {
        const name = entry.fileName;
        if (
          names.has(name) ||
          name.includes('\0') ||
          name.split('/').includes('.') ||
          entry.isEncrypted() ||
          ![0, 8].includes(entry.compressionMethod)
        )
          throw new Error('Unsafe archive entry');
        names.add(name);
        total += entry.uncompressedSize;
        if (entry.uncompressedSize > 20000000 || total > 50000000) throw new Error('Expanded archive exceeds limit');
        const isXml = name.endsWith('.xml') || name.endsWith('.rels');
        if (isXml && entry.uncompressedSize > 10000000) throw new Error('XML exceeds limit');
        const stream = await zip.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        let checksum = 0;
        let length = 0;
        try {
          for await (const chunk of stream) {
            length += chunk.length;
            if (length > entry.uncompressedSize) throw new Error('Invalid entry size');
            checksum = crc32(chunk, checksum);
            if (isXml) chunks.push(chunk);
          }
        } finally {
          stream.destroy();
        }
        if (checksum !== entry.crc32 || length !== entry.uncompressedSize) throw new Error('Corrupt archive');
        if (isXml) xml.set(name, inspectXml(Buffer.concat(chunks)));
      }
      const types = xml.get('[Content_Types].xml');
      const relationships = xml.get('_rels/.rels');
      if (
        types?.root !== 'Types' ||
        types.namespace !== contentTypesNamespace ||
        relationships?.root !== 'Relationships' ||
        relationships.namespace !== relationshipsNamespace ||
        relationships.targets.length !== 1
      )
        throw new Error('Missing DOCX package');
      const target = relationships.targets[0]?.replace(/^\//, '');
      if (!target || target.split('/').some((part) => part === '..' || part === '.') || target.includes('\\'))
        throw new Error('Invalid main part');
      const main = xml.get(target);
      if (
        types.overrides.get(`/${target}`) !== mainContentType ||
        main?.root !== 'document' ||
        !wordNamespaces.has(main.namespace) ||
        !main.body
      )
        throw new Error('Missing DOCX content');
    } finally {
      zip.close();
    }
  } catch {
    throw new BadRequestException(
      'Choose a valid DOCX file. The file is not a DOCX, is damaged, or exceeds safe archive limits.'
    );
  }
}
