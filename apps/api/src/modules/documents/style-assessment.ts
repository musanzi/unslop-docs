import { ProviderFailure } from './provider-failure';
import { DocxBlock, DocxDocument } from './docx-model';

export const assessmentRubric = 'unslop-style-v1';
export const assessmentMethod = 'sentence-severity-word-weighted-v1';

export interface StyleAssessment {
  provider: 'deepseek';
  status: 'complete' | 'unavailable';
  score: number | null;
  reason: 'no_prose' | null;
  modelVersion: string;
  method: typeof assessmentMethod;
  checkedAt: string;
  textHash: string;
  characterCount: number;
  wordCount: number;
  sentenceCount: number;
  weightedSeverity: number;
}

export function styleScore(wordCount: number, weightedSeverity: number): number | null {
  return wordCount ? Math.round((100 * weightedSeverity) / (3 * wordCount)) : null;
}

export function validateStyleAssessment(value: unknown): StyleAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderFailure('output');
  const r = value as Record<string, unknown>;
  const complete = r['status'] === 'complete';
  if (
    r['provider'] !== 'deepseek' ||
    (!complete && r['status'] !== 'unavailable') ||
    typeof r['modelVersion'] !== 'string' ||
    !r['modelVersion'].trim() ||
    r['method'] !== assessmentMethod ||
    typeof r['checkedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(r['checkedAt'])) ||
    typeof r['textHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r['textHash']) ||
    !['characterCount', 'wordCount', 'sentenceCount', 'weightedSeverity'].every(
      (key) => Number.isSafeInteger(r[key]) && Number(r[key]) >= 0
    ) ||
    Number(r['weightedSeverity']) > 3 * Number(r['wordCount']) ||
    Number(r['sentenceCount']) > Number(r['wordCount']) ||
    (complete &&
      (Number(r['wordCount']) < 1 ||
        Number(r['sentenceCount']) < 1 ||
        r['reason'] !== null ||
        r['score'] !== styleScore(Number(r['wordCount']), Number(r['weightedSeverity'])))) ||
    (!complete &&
      (r['score'] !== null ||
        r['reason'] !== 'no_prose' ||
        r['wordCount'] !== 0 ||
        r['sentenceCount'] !== 0 ||
        r['weightedSeverity'] !== 0))
  )
    throw new ProviderFailure('output');
  return {
    provider: 'deepseek',
    status: complete ? 'complete' : 'unavailable',
    score: complete ? Number(r['score']) : null,
    reason: complete ? null : 'no_prose',
    modelVersion: r['modelVersion'],
    method: assessmentMethod,
    checkedAt: r['checkedAt'],
    textHash: r['textHash'],
    characterCount: Number(r['characterCount']),
    wordCount: Number(r['wordCount']),
    sentenceCount: Number(r['sentenceCount']),
    weightedSeverity: Number(r['weightedSeverity'])
  };
}

export function assessmentText(document: DocxDocument): string {
  let references = false;
  const paragraphs: string[] = [];
  const visit = (blocks: readonly DocxBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'table') {
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
        continue;
      }
      if (block.kind === 'protected') continue;
      if (
        /^(references|bibliography|bibliographie|références)(\s+bibliographiques)?\s*[:.]?$/iu.test(block.text.trim())
      ) {
        references = true;
        continue;
      }
      if (block.kind === 'heading') references = false;
      if (references || /quote|citation|code|bibliograph|reference/iu.test(block.style ?? '')) continue;
      paragraphs.push(block.inlines.map((inline) => (inline.kind === 'protected' ? ' ' : inline.text)).join(''));
    }
  };
  visit(document.blocks);
  return paragraphs.join('\n');
}

export interface AssessmentSentence {
  id: string;
  text: string;
  wordCount: number;
}

export function assessmentSentences(text: string): AssessmentSentence[] {
  const prose = text
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`\n]+`/gu, ' ')
    .replace(/"[^"]*"|“[^”]*”|«[^»]*»|‘[^’]*’|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\[(?:\d+[\s,;–-]*)+\]/gu, ' ')
    .replace(/\(\p{Lu}[\p{L}.'’ &-]*(?:et al\.)?,\s*(?:19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.\s*[\d–-]+)?\)/gu, ' ');
  const words = new Intl.Segmenter(['en', 'fr'], { granularity: 'word' });
  const sentences = new Intl.Segmenter(['en', 'fr'], { granularity: 'sentence' });
  return prose
    .split('\n')
    .flatMap((line) => [...sentences.segment(line)].map((s) => s.segment.trim()))
    .map((sentence) => ({ text: sentence, wordCount: [...words.segment(sentence)].filter((w) => w.isWordLike).length }))
    .filter((s) => s.wordCount > 0)
    .map((s, i) => ({ id: `s${i}`, ...s }));
}
