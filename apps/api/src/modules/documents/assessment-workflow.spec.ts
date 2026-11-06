import { describe, expect, it, vi } from 'vitest';
import { createAssessmentWorkflow, validateAssessment } from './assessment-workflow';
import { styleAssessmentFixture } from '@api/shared/testing/style-assessment-fixtures';

describe('Writing assessment workflow', () => {
  it('publishes a validated style result without a prompt or rewrite information', async () => {
    const result = styleAssessmentFixture(63);
    const assess = vi.fn<(text: string, signal?: AbortSignal) => Promise<unknown>>(async () => result);
    const workflow = createAssessmentWorkflow({ assess });
    expect((await workflow.invoke({ text: 'A document.' })).assessment).toEqual(result);
    expect(assess.mock.calls[0][0]).toBe('A document.');
    expect(assess.mock.calls[0]).toHaveLength(2);
  });
  it('does not retry a failed assessment node', async () => {
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
    { rubric: 'unslop-style-v1' },
    { rubric: 'unknown', style: styleAssessmentFixture().style }
  ])('rejects anything other than the writing-assessment contract %#', (raw) => {
    expect(() => validateAssessment(raw)).toThrow('Invalid assessment');
  });
});
