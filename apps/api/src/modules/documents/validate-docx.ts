import { BadRequestException } from '@nestjs/common';
import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';
import { SaxesParser } from 'saxes';
import { createHash } from 'node:crypto';
import { documentModel, freezeModel, XmlNode } from './docx-content';
import { finalVersion } from './docx-final-version';
import { documentLanguage } from './docx-language';
import { DocxDocument } from './docx-model';

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

function inspectXml(bytes: Buffer, budget: { nodes: number }) {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let root = '';
  let namespace = '';
  let body = false;
  const tags: XmlNode[] = [];
  let tree: XmlNode;
  const source = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  let start = 0;
  parser.on('opentagstart', () => {
    start = source.lastIndexOf('<', parser.position - 1);
  });
  const overrides = new Map<string, string>();
  const targets: string[] = [];
  parser.on('doctype', () => {
    throw new Error('Document types are not allowed');
  });
  parser.on('opentag', (tag) => {
    if (wordNamespaces.has(tag.uri)) {
      const unsupported: Record<string, string> = {
        object: 'embedded objects',
        altChunk: 'imported content',
        subDoc: 'subdocuments'
      };
      if (unsupported[tag.local])
        throw new BadRequestException(
          `This DOCX contains unsupported ${unsupported[tag.local]}. Convert them to ordinary paragraphs or images, then upload again.`
        );
    }
    if (tag.uri === 'urn:schemas-microsoft-com:office:office' && tag.local === 'OLEObject')
      throw new BadRequestException(
        'This DOCX contains unsupported embedded objects. Convert them to ordinary paragraphs or images, then upload again.'
      );
    if (
      tag.uri === relationshipsNamespace &&
      tag.local === 'Relationship' &&
      /\/(oleObject|package|aFChunk|subDocument)$/.test(tag.attributes.Type?.value ?? '')
    )
      throw new BadRequestException(
        'This DOCX contains unsupported embedded objects or imported content. Remove them or convert them to ordinary paragraphs or images, then upload again.'
      );
    if (++budget.nodes > 100000) throw new Error('XML node count exceeds limit');
    const node: XmlNode = {
      local: tag.local,
      uri: tag.uri,
      attributes: Object.values(tag.attributes),
      children: [],
      text: '',
      start,
      contentStart: parser.position,
      contentEnd: 0,
      end: 0
    };
    if (tags.length) tags.at(-1).children.push(node);
    else tree = node;
    tags.push(node);
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
  const collectText = (value: string) => {
    const tag = tags.at(-1);
    if (tag) tag.text += value;
  };
  parser.on('text', collectText);
  parser.on('cdata', collectText);
  parser.on('closetag', (closing) => {
    const tag = tags.pop();
    tag.end = parser.position;
    tag.contentEnd = closing.isSelfClosing ? tag.contentStart : source.lastIndexOf('</', parser.position - 1);
    depth--;
  });
  parser.write(source).close();
  return { root, namespace, body, overrides, targets, source, tree };
}

export async function readDocx(bytes: Buffer): Promise<DocxDocument> {
  try {
    if (bytes.length > 10000000) throw new BadRequestException('Choose a DOCX file of 10 MB or less.');
    if (bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')))
      throw new BadRequestException(
        'This file may be password-protected or an older Word document. Remove its password and save it as DOCX, then upload again.'
      );
    const zip = await fromBufferPromise(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
    try {
      if (zip.entryCount > 2048) throw new Error('Too many archive entries');
      const names = new Set<string>();
      const xml = new Map<string, ReturnType<typeof inspectXml>>();
      const parts = new Map<string, Buffer>();
      const budget = { nodes: 0 };
      let total = 0;
      for await (const entry of zip.eachEntry()) {
        const name = entry.fileName;
        if (entry.isEncrypted())
          throw new BadRequestException('This DOCX is password-protected. Remove the password and upload again.');
        if (
          names.has(name) ||
          name.includes('\0') ||
          name.split('/').includes('.') ||
          ![0, 8].includes(entry.compressionMethod)
        )
          throw new Error('Unsafe archive entry');
        names.add(name);
        total += entry.uncompressedSize;
        if (
          (entry.uncompressedSize > 1000000 && entry.uncompressedSize > entry.compressedSize * 200) ||
          (total > 1000000 && total > bytes.length * 200)
        )
          throw new Error('Archive compression ratio exceeds limit');
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
            chunks.push(chunk);
          }
        } finally {
          stream.destroy();
        }
        if (checksum !== entry.crc32 || length !== entry.uncompressedSize) throw new Error('Corrupt archive');
        const content = Buffer.concat(chunks);
        parts.set(name, content);
        if (isXml) xml.set(name, inspectXml(content, budget));
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
      const normalized = finalVersion(main.source, main.tree);
      if (normalized !== undefined) {
        parts.set(target, Buffer.from(normalized));
        xml.set(target, inspectXml(parts.get(target), { nodes: 0 }));
      }
      const model = documentModel(target, new Map([...xml].map(([name, value]) => [name, value.tree])));
      let wordCount = 0;
      for (const segment of new Intl.Segmenter('en', { granularity: 'word' }).segment(model.text))
        if (segment.isWordLike) wordCount++;
      if (wordCount > 10000)
        throw new BadRequestException(
          `This document has ${wordCount.toLocaleString('en-US')} words. The limit is 10,000. Shorten it and upload again.`
        );
      const sources = new Map([...xml].map(([name, value]) => [name, value.source]));
      return freezeModel({
        mainPart: target,
        ...model,
        wordCount,
        language: documentLanguage(model.text),
        protectedParts: [...parts]
          .filter(([name]) => name !== target)
          .map(([name, content]) => ({
            name,
            size: content.length,
            sha256: createHash('sha256').update(content).digest('hex')
          })),
        readXmlPart: (name: string) => sources.get(name),
        readPart: (name: string) => (parts.has(name) ? Buffer.from(parts.get(name)) : undefined)
      });
    } finally {
      zip.close();
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    if (error instanceof Error && /encryption|encrypted/.test(error.message))
      throw new BadRequestException('This DOCX is password-protected. Remove the password and upload again.');
    throw new BadRequestException(
      'Choose a valid DOCX file. The file is not a DOCX, is damaged, or exceeds safe archive limits. Open it in Word, save a new DOCX, and upload again. Reduce large images if needed.'
    );
  }
}

export async function validateDocx(bytes: Buffer): Promise<void> {
  await readDocx(bytes);
}
