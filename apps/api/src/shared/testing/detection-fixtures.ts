import { detectionMethod, detectorModelVersion, DocumentDetection } from '../../modules/documents/detection-rate';

export function detectionFixture(rate = 40): DocumentDetection {
  return {
    status: 'complete',
    rate,
    reason: null,
    aiScore: rate / 100,
    modelVersion: detectorModelVersion,
    method: detectionMethod,
    checkedAt: '2026-11-07T00:00:00.000Z',
    textHash: 'a'.repeat(64),
    characterCount: 1000,
    tokenCount: 200,
    segmentCount: 1
  };
}
