import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LocalDetectorProvider, localDetectorSettings } from './local-detector-provider';
import { detectorModelVersion, detectionMethod } from './detection-rate';
import { assessmentResponse } from './dto/document-assessment-response';

const text = 'Les résultats sont présentés dans le tableau. '.repeat(20);
const settings = localDetectorSettings({ LOCAL_DETECTOR_URL: 'http://localhost:8090' });
const detection = {
  provider: 'local',
  status: 'complete',
  aiScore: 0.62,
  reason: null,
  modelVersion: detectorModelVersion,
  method: detectionMethod,
  checkedAt: '2026-11-06T00:00:00.000Z',
  textHash: createHash('sha256').update(text).digest('hex'),
  characterCount: text.length,
  tokenCount: 200,
  segmentCount: 1
};

describe('Local detector boundary', () => {
  it('submits the complete French document without credentials and publishes the rate', async () => {
    const fetcher = vi.fn(async () => Response.json({ ...detection, privateDetail: text }));
    const result = await new LocalDetectorProvider(settings, fetcher).detect(text);
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8090/detect',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
    );
    expect(result).toMatchObject({ status: 'complete', rate: 62, aiScore: 0.62 });
    expect(assessmentResponse(result)).toEqual({
      status: 'complete',
      rate: 62,
      reason: null,
      method: detectionMethod,
      checkedAt: detection.checkedAt
    });
    expect(JSON.stringify(result)).not.toContain('privateDetail');
  });

  it('reports no prose without calling the detector', async () => {
    const fetcher = vi.fn();
    expect(await new LocalDetectorProvider(settings, fetcher).detect('  ')).toMatchObject({
      status: 'unavailable',
      rate: null,
      reason: 'no_prose'
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...detection, aiScore: 1.1 },
    { ...detection, aiScore: '0.5' },
    { ...detection, aiScore: null },
    { ...detection, textHash: '0'.repeat(64) },
    { ...detection, characterCount: 1 },
    { ...detection, modelVersion: 'unverified' },
    { ...detection, method: 'truncated' },
    { ...detection, segmentCount: 0 },
    { ...detection, status: 'unavailable', aiScore: 0 }
  ])('rejects malformed, mismatched, or incomplete responses %#', async (body) => {
    await expect(
      new LocalDetectorProvider(settings, async () => Response.json(body)).detect(text)
    ).rejects.toMatchObject({ category: 'output', temporary: false });
  });

  it('keeps an unavailable short-text result empty so editing can remain available', async () => {
    const unavailable = {
      ...detection,
      status: 'unavailable',
      aiScore: null,
      reason: 'too_short',
      tokenCount: 0,
      segmentCount: 0
    };
    const provider = new LocalDetectorProvider(settings, async () => Response.json(unavailable));
    expect(await provider.detect(text)).toMatchObject({ status: 'unavailable', rate: null, reason: 'too_short' });
  });

  it.each([
    [400, 'request', false],
    [429, 'rate_limit', true],
    [503, 'server', true]
  ])('classifies HTTP %s once without retaining private response contents', async (status, category, temporary) => {
    const fetcher = vi.fn(async () => new Response('private-document', { status: Number(status) }));
    const error = await new LocalDetectorProvider(settings, fetcher).detect(text).catch((error: unknown) => error);
    expect(error).toMatchObject({ category, temporary, status });
    expect(JSON.stringify(error)).not.toContain('private-');
    expect(error).not.toHaveProperty('cause');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('classifies network failures and cancellation without hidden retries', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('private-network-data');
    });
    const provider = new LocalDetectorProvider(settings, fetcher);
    await expect(provider.detect(text)).rejects.toMatchObject({
      category: 'network',
      temporary: true
    });
    await expect(provider.detect(text, AbortSignal.abort())).rejects.toMatchObject({
      category: 'cancelled',
      temporary: false
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds the request without turning a timeout into a cancellation', async () => {
    const fetcher: typeof fetch = vi.fn(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        })
    );
    const provider = new LocalDetectorProvider({ ...settings, timeoutMs: 10 }, fetcher);
    await expect(provider.detect(text)).rejects.toMatchObject({
      category: 'timeout',
      temporary: true
    });
  });

  it('uses a private Compose endpoint by default and rejects credentials in the URL', () => {
    expect(localDetectorSettings({})).toEqual({ url: 'http://detector:8090/detect', timeoutMs: 600000 });
    expect(() => localDetectorSettings({ LOCAL_DETECTOR_URL: 'http://user:secret@host' })).toThrow(
      'LOCAL_DETECTOR_URL is invalid'
    );
    expect(() => localDetectorSettings({ LOCAL_DETECTOR_TIMEOUT_MS: 'NaN' })).toThrow('LOCAL_DETECTOR_TIMEOUT_MS must');
  });
});
