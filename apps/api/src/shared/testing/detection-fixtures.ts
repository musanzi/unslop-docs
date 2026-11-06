import type { DetectionAssessment } from '../../modules/documents/assessment-workflow';
import { detectionMethod, detectionRubric, detectorModelVersion } from '../../modules/documents/ai-detection';

export function detectionFixture(percent = 40): DetectionAssessment {
  return {
    rubric: detectionRubric,
    detection: {
      provider: 'local',
      status: 'complete',
      aiScore: percent / 100,
      reason: null,
      modelVersion: detectorModelVersion,
      method: detectionMethod,
      checkedAt: '2026-11-06T00:00:00.000Z',
      textHash: 'a'.repeat(64),
      characterCount: 1000,
      tokenCount: 250,
      segmentCount: 1
    }
  };
}
