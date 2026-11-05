import { describe, expect, it, vi } from 'vitest';
import { assessmentRubric, createAssessmentWorkflow } from './assessment-workflow';

describe('Writing assessment workflow', () => {
  it('publishes the validated rubric score with known writing patterns and exact source examples', async () => {
    const workflow = createAssessmentWorkflow(
      {
        assess: async () => ({
          patterns: [
            { rule: 7, examples: ['delve', 'invented quote'] },
            { rule: 999, examples: ['delve'] },
            { rule: 8, examples: ['not in the source'] }
          ],
          score: 63,
          summary: 'AI wrote this'
        })
      },
      'pinned rules'
    );
    const result = await workflow.invoke({ text: 'We delve into the results.' });
    expect(result.assessment).toEqual({
      rubric: assessmentRubric,
      score: 63,
      patterns: [{ rule: 7, name: 'AI vocabulary', examples: ['delve'] }]
    });
  });
  it('rounds a fractional score and keeps the no-pattern outcome', async () => {
    const workflow = createAssessmentWorkflow({ assess: async () => ({ patterns: [], score: 12.6 }) }, 'rules');
    expect((await workflow.invoke({ text: 'Les résultats sont présentés dans le tableau.' })).assessment).toEqual({
      rubric: assessmentRubric,
      score: 13,
      patterns: []
    });
  });
  it('describes the document-wide rubric without estimating authorship or reading a prior score', async () => {
    const assess = vi.fn(async () => ({ patterns: [], score: 0 }));
    await createAssessmentWorkflow({ assess }, 'rules').invoke({ text: 'A document.' });
    const [system, text] = assess.mock.calls[0] as unknown as [string, string];
    expect(text).toBe('A document.');
    expect(system).toContain(assessmentRubric);
    for (const dimension of ['repetitive phrasing', 'generic filler', 'formulaic transitions', 'inflated language'])
      expect(system).toContain(dimension);
    expect(system).toContain('does not estimate who wrote');
    expect(system).toContain('whole document');
    expect(system).not.toMatch(/previous score|rewrite strength/i);
  });
  it('does not retry a failed assessment node', async () => {
    const assess = vi.fn(async () => {
      throw new Error('provider failed');
    });
    await expect(createAssessmentWorkflow({ assess }, 'rules').invoke({ text: 'A document.' })).rejects.toThrow();
    expect(assess).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    {},
    { patterns: 'invalid', score: 10 },
    { patterns: [{ rule: 23, examples: null }], score: 10 },
    { patterns: [] },
    { patterns: [], score: '42' },
    { patterns: [], score: -1 },
    { patterns: [], score: 100.5 },
    { patterns: [], score: Number.NaN }
  ])('rejects malformed provider output %#', async (raw) => {
    await expect(
      createAssessmentWorkflow({ assess: async () => raw }, 'rules').invoke({ text: 'A document.' })
    ).rejects.toThrow('Invalid assessment');
  });
});
