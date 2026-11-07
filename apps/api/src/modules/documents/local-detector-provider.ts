import { createHash } from 'node:crypto';
import {
  detectionMethod,
  detectionRate,
  detectorModelVersion,
  DocumentDetection,
  validateDetection
} from './detection-rate';
import { classifyProviderFailure, ProviderFailure } from './provider-failure';

export interface DetectionProvider {
  detect(text: string, signal?: AbortSignal): Promise<unknown>;
}

export function localDetectorSettings(env: NodeJS.ProcessEnv) {
  const url = env.LOCAL_DETECTOR_URL?.trim() || 'http://detector:8090';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('LOCAL_DETECTOR_URL is invalid.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('LOCAL_DETECTOR_URL is invalid.');
  const timeoutMs = env.LOCAL_DETECTOR_TIMEOUT_MS === undefined ? 600000 : Number(env.LOCAL_DETECTOR_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647)
    throw new Error('LOCAL_DETECTOR_TIMEOUT_MS must be a positive integer no greater than 2147483647.');
  return { url: new URL('/detect', parsed).toString(), timeoutMs };
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class LocalDetectorProvider implements DetectionProvider {
  constructor(
    private readonly settings: ReturnType<typeof localDetectorSettings>,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async detect(text: string, signal?: AbortSignal): Promise<DocumentDetection> {
    if (!text.trim())
      return {
        status: 'unavailable',
        rate: null,
        reason: 'no_prose',
        aiScore: null,
        modelVersion: detectorModelVersion,
        method: detectionMethod,
        checkedAt: new Date().toISOString(),
        textHash: textHash(text),
        characterCount: text.length,
        tokenCount: 0,
        segmentCount: 0
      };
    try {
      signal?.throwIfAborted();
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.settings.timeoutMs)])
        : AbortSignal.timeout(this.settings.timeoutMs);
      let response: Response;
      try {
        response = await this.fetcher(this.settings.url, {
          method: 'POST',
          redirect: 'error',
          signal: requestSignal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
      } catch (error) {
        if (signal?.aborted) throw new ProviderFailure('cancelled');
        if (requestSignal.aborted) throw new ProviderFailure('timeout');
        if (error instanceof TypeError) throw new ProviderFailure('network');
        throw error;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw classifyProviderFailure({ status: response.status });
      }
      let raw: Record<string, unknown>;
      try {
        raw = (await response.json()) as Record<string, unknown>;
      } catch {
        throw new ProviderFailure('output');
      }
      signal?.throwIfAborted();
      const score = raw?.['aiScore'];
      const detection = validateDetection({
        ...raw,
        rate: typeof score === 'number' ? detectionRate(score) : null
      });
      if (detection.textHash !== textHash(text) || detection.characterCount !== text.length)
        throw new ProviderFailure('output');
      return detection;
    } catch (error) {
      throw classifyProviderFailure(error, signal);
    }
  }
}
