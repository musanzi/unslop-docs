import { describe, expect, it, vi } from 'vitest';
import { createAssessmentWorkflow, validateAssessment } from './assessment-workflow';
import { detectionFixture } from '@api/shared/testing/detection-fixtures';

describe('Local assessment workflow', () => {
  it('publishes a validated detection result without a prompt or rewrite information', async () => {
    const result = detectionFixture(63);
    const assess = vi.fn<(text: string, signal?: AbortSignal) => Promise<unknown>>(async () => result);
    const workflow = createAssessmentWorkflow({ assess });
    expect((await workflow.invoke({ text: 'A document.' })).assessment).toEqual(result);
    expect(assess.mock.calls[0][0]).toBe('A document.');
    expect(assess.mock.calls[0]).toHaveLength(2);
  });
  it('does not retry a failed detector node', async () => {
    const assess = vi.fn(async () => {
      throw new Error('provider failed');
    });
    await expect(createAssessmentWorkflow({ assess }).invoke({ text: 'A document.' })).rejects.toThrow();
    expect(assess).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    {},
    { score: 10 },
    { rubric: 'local-detector-v1' },
    { rubric: 'unknown', detection: detectionFixture().detection }
  ])('rejects anything other than the new detector contract %#', (raw) => {
    expect(() => validateAssessment(raw)).toThrow('Invalid assessment');
  });
});
