import type { WritingAssessment } from '../../modules/documents/assessment-workflow';
import { assessmentMethod, assessmentRubric } from '../../modules/documents/style-assessment';

export function styleAssessmentFixture(percent = 40): WritingAssessment {
  return {
    rubric: assessmentRubric,
    findings: [],
    style: {
      provider: 'deepseek',
      status: 'complete',
      score: percent,
      reason: null,
      modelVersion: 'test-model',
      method: assessmentMethod,
      checkedAt: '2026-11-06T00:00:00.000Z',
      textHash: 'a'.repeat(64),
      characterCount: 1000,
      wordCount: 100,
      sentenceCount: 1,
      weightedSeverity: percent * 3
    }
  };
}
