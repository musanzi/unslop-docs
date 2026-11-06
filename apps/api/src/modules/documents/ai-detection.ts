import { ProviderFailure } from './provider-failure';

export const detectionRubric = 'local-detector-v1';
export const detectorModelVersion = 'danibor/oculus-v2.0-multilingual@e6b41a2159c78d480738317c3ea6a680073a7b32';
export const detectionMethod = 'token-weighted-mean-v1';

export interface AiDetection {
  provider: 'local';
  status: 'complete' | 'unavailable';
  aiScore: number | null;
  reason: 'too_short' | 'too_long' | null;
  modelVersion: string;
  method: typeof detectionMethod;
  checkedAt: string;
  textHash: string;
  characterCount: number;
  tokenCount: number;
  segmentCount: number;
}

export function validateDetection(value: unknown): AiDetection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderFailure('output');
  const result = value as Record<string, unknown>;
  const score = result['aiScore'];
  const status = result['status'];
  const reason = result['reason'];
  const complete = status === 'complete';
  if (
    result['provider'] !== 'local' ||
    (status !== 'complete' && status !== 'unavailable') ||
    result['modelVersion'] !== detectorModelVersion ||
    result['method'] !== detectionMethod ||
    typeof result['checkedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(result['checkedAt'])) ||
    typeof result['textHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result['textHash']) ||
    !Number.isSafeInteger(result['characterCount']) ||
    Number(result['characterCount']) < 1 ||
    !Number.isSafeInteger(result['tokenCount']) ||
    Number(result['tokenCount']) < 0 ||
    !Number.isSafeInteger(result['segmentCount']) ||
    Number(result['segmentCount']) < 0 ||
    (complete &&
      (typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 1 ||
        reason !== null ||
        Number(result['tokenCount']) < 1 ||
        Number(result['segmentCount']) < 1)) ||
    (!complete && (score !== null || (reason !== 'too_short' && reason !== 'too_long')))
  )
    throw new ProviderFailure('output');
  return {
    provider: 'local',
    status,
    aiScore: complete ? Number(score) : null,
    reason: reason === 'too_short' || reason === 'too_long' ? reason : null,
    modelVersion: detectorModelVersion,
    method: detectionMethod,
    checkedAt: result['checkedAt'],
    textHash: result['textHash'],
    characterCount: Number(result['characterCount']),
    tokenCount: Number(result['tokenCount']),
    segmentCount: Number(result['segmentCount'])
  };
}
