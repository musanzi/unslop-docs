export function documentFilename(original: string): string {
  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  const value = decoded.includes('\uFFFD') ? original : decoded;
  const basename = value.split(/[/\\]/).at(-1).normalize('NFC');
  const stem = basename
    .replace(/\.[^.]*$/, '')
    .replace(/[\p{C}";:*?<>|/\\]+/gu, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return `${Array.from(stem || 'document')
    .slice(0, 120)
    .join('')}.docx`;
}
