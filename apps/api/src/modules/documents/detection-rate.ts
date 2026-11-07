import { ProviderFailure } from './provider-failure';
import { DocxBlock, DocxDocument } from './docx-model';

export const detectionMethod = 'token-weighted-mean-v1';
export const detectorModelVersion = 'danibor/oculus-v2.0-multilingual@e6b41a2159c78d480738317c3ea6a680073a7b32';

export type DetectionUnavailableReason = 'no_prose' | 'too_short' | 'too_long';

export interface DocumentDetection {
  status: 'complete' | 'unavailable';
  rate: number | null;
  reason: DetectionUnavailableReason | null;
  aiScore: number | null;
  modelVersion: typeof detectorModelVersion;
  method: typeof detectionMethod;
  checkedAt: string;
  textHash: string;
  characterCount: number;
  tokenCount: number;
  segmentCount: number;
}

export function detectionRate(aiScore: number): number {
  return Math.round(aiScore * 100);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function validateDetection(value: unknown): DocumentDetection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderFailure('output');
  const r = value as Record<string, unknown>;
  const score = r['aiScore'];
  const reason = r['reason'];
  const complete = r['status'] === 'complete';
  const scored = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1;
  if (
    (!complete && r['status'] !== 'unavailable') ||
    r['modelVersion'] !== detectorModelVersion ||
    r['method'] !== detectionMethod ||
    typeof r['checkedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(r['checkedAt'])) ||
    typeof r['textHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r['textHash']) ||
    !isCount(r['characterCount']) ||
    !isCount(r['tokenCount']) ||
    !isCount(r['segmentCount']) ||
    (complete &&
      (!scored ||
        reason !== null ||
        r['rate'] !== detectionRate(score) ||
        Number(r['tokenCount']) < 1 ||
        Number(r['segmentCount']) < 1)) ||
    (!complete &&
      (score !== null ||
        r['rate'] !== null ||
        (reason !== 'no_prose' && reason !== 'too_short' && reason !== 'too_long')))
  )
    throw new ProviderFailure('output');
  return {
    status: complete ? 'complete' : 'unavailable',
    rate: complete ? detectionRate(score as number) : null,
    reason: complete ? null : (reason as DetectionUnavailableReason),
    aiScore: complete ? (score as number) : null,
    modelVersion: detectorModelVersion,
    method: detectionMethod,
    checkedAt: r['checkedAt'],
    textHash: r['textHash'],
    characterCount: Number(r['characterCount']),
    tokenCount: Number(r['tokenCount']),
    segmentCount: Number(r['segmentCount'])
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
