import { describe, expect, it, vi } from 'vitest';
import { createAssessmentWorkflow } from './assessment-workflow';

describe('Writing assessment workflow', () => {
  it('publishes only known writing patterns with exact source examples', async () => {
    const workflow = createAssessmentWorkflow(
      {
        assess: async () => ({
          patterns: [
            { rule: 7, examples: ['delve', 'invented quote'] },
            { rule: 999, examples: ['delve'] },
            { rule: 8, examples: ['not in the source'] }
          ],
          score: 99
        })
      },
      'pinned rules'
    );
    const result = await workflow.invoke({ text: 'We delve into the results.' });
    expect(result.assessment).toEqual({ patterns: [{ rule: 7, name: 'AI vocabulary', examples: ['delve'] }] });
  });
  it('returns the no-pattern outcome and never adds a model score or summary', async () => {
    const workflow = createAssessmentWorkflow(
      { assess: async () => ({ patterns: [], score: 100, summary: 'AI wrote this' }) },
      'rules'
    );
    expect((await workflow.invoke({ text: 'Les résultats sont présentés dans le tableau.' })).assessment).toEqual({
      patterns: []
    });
  });
  it('does not retry a failed assessment node', async () => {
    const assess = vi.fn(async () => {
      throw new Error('provider failed');
    });
    await expect(createAssessmentWorkflow({ assess }, 'rules').invoke({ text: 'A document.' })).rejects.toThrow();
    expect(assess).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { patterns: 'invalid' }, { patterns: [{ rule: 23, examples: null }] }])(
    'rejects malformed provider output',
    async (raw) => {
      await expect(
        createAssessmentWorkflow({ assess: async () => raw }, 'rules').invoke({ text: 'A document.' })
      ).rejects.toThrow('Invalid assessment');
    }
  );
});
