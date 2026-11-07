import { XmlNode } from './docx-content';

const wordUris = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main'
];
const conflictUri = 'http://schemas.microsoft.com/office/word/2010/wordml';
const removedElements = new Set([
  'del',
  'moveFrom',
  'sdtPr',
  'sdtEndPr',
  'cellIns',
  'cellDel',
  'cellMerge',
  'numberingChange'
]);
const unwrappedElements = new Set(['sdt', 'sdtContent', 'ins', 'moveTo']);

interface Range {
  start: number;
  end: number;
}

function isWord(node: XmlNode, name: string) {
  return wordUris.includes(node.uri) && node.local === name;
}
function deletedRow(node: XmlNode) {
  return (
    isWord(node, 'tr') &&
    node.children.some((item) => isWord(item, 'trPr') && item.children.some((mark) => isWord(mark, 'del')))
  );
}
function removed(node: XmlNode) {
  if (node.uri === conflictUri) return node.local === 'conflictDel';
  if (!wordUris.includes(node.uri)) return false;
  return (
    removedElements.has(node.local) ||
    node.local.endsWith('Change') ||
    /^(moveFrom|moveTo|customXml\w*)Range(Start|End)$/.test(node.local) ||
    deletedRow(node)
  );
}
function unwrapped(node: XmlNode) {
  if (node.uri === conflictUri) return node.local === 'conflictIns';
  return wordUris.includes(node.uri) && unwrappedElements.has(node.local);
}

export function finalVersionRanges(tree: XmlNode): Range[] {
  const ranges: Range[] = [];
  const walk = (node: XmlNode) => {
    if (removed(node)) {
      ranges.push({ start: node.start, end: node.end });
      return;
    }
    if (unwrapped(node)) {
      ranges.push({ start: node.start, end: node.contentStart });
      if (node.contentEnd < node.end) ranges.push({ start: node.contentEnd, end: node.end });
    }
    node.children.forEach(walk);
  };
  walk(tree);
  return ranges.sort((left, right) => left.start - right.start);
}

export function finalVersion(source: string, tree: XmlNode): string | undefined {
  const ranges = finalVersionRanges(tree);
  if (!ranges.length) return undefined;
  let xml = source;
  for (const range of ranges.reverse()) xml = xml.slice(0, range.start) + xml.slice(range.end);
  return xml.replace(/^(<\?xml\b[^?]*encoding=["'])[^"']+(["'][^?]*\?>)/, '$1UTF-8$2');
}
