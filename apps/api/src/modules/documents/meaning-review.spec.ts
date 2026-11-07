import { describe, expect, it } from 'vitest';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';
import { createRewriteWorkflow } from './document-workflow';
import { EditProvider } from './revise-docx';
import { RevisionValidationError } from './revision-validation';
import { readDocx } from './validate-docx';

const claim = 'The treatment may reduce symptoms in some patients who follow the program.';
const hardened = 'The treatment will reduce symptoms in all patients who follow the program.';

function rewriteTo(text: string): EditProvider['edit'] {
  return async (_system, chunk) => ({ edits: chunk.spans.map(({ id }) => ({ id, text })) });
}

async function rewrite(provider: EditProvider) {
  const source = await readDocx(await readerFixture(textParagraph(claim)));
  const result = await createRewriteWorkflow(provider, 'rules', 100).invoke({ source });
  return { text: (await readDocx(result.revised)).text, kept: result.notices.keptPassages };
}

describe('Meaning review', () => {
  it('keeps the original wording and records a notice when a rewrite changes a claim', async () => {
    const { text, kept } = await rewrite({
      edit: rewriteTo(hardened),
      reviewMeaning: async (_system, { pairs }) => ({ reviews: pairs.map(({ id }) => ({ id, preserved: false })) })
    });
    expect(text).toBe(claim);
    expect(kept).toEqual([expect.objectContaining({ check: 'meaning', excerpt: claim })]);
  });

  it('accepts a rewrite that the review finds faithful', async () => {
    const reworded = 'Some patients who follow the program may see their symptoms reduced by the treatment.';
    const { text, kept } = await rewrite({
      edit: rewriteTo(reworded),
      reviewMeaning: async (_system, { pairs }) => ({ reviews: pairs.map(({ id }) => ({ id, preserved: true })) })
    });
    expect(text).toBe(reworded);
    expect(kept).toEqual([]);
  });

  it('sends the original and the rewrite together and marks the passages as untrusted', async () => {
    const requests: { system: string; original: string; revised: string }[] = [];
    await rewrite({
      edit: rewriteTo(hardened),
      reviewMeaning: async (system, { pairs }) => {
        requests.push(...pairs.map(({ original, revised }) => ({ system, original, revised })));
        return { reviews: pairs.map(({ id }) => ({ id, preserved: true })) };
      }
    });
    expect(requests).toEqual([
      { system: expect.stringContaining('untrusted data'), original: claim, revised: hardened }
    ]);
  });

  it('skips the review when no passage changed', async () => {
    let reviews = 0;
    const { text } = await rewrite({
      edit: rewriteTo(claim),
      reviewMeaning: async () => {
        reviews++;
        return { reviews: [] };
      }
    });
    expect(text).toBe(claim);
    expect(reviews).toBe(0);
  });

  it.each([
    ['an unreadable response', { verdict: 'fine' }],
    ['a missing verdict', { reviews: [] }],
    ['a verdict without a boolean', { reviews: [{ id: 'unknown', preserved: 'yes' }] }]
  ])('rejects %s instead of accepting the rewrite unchecked', async (_name, response) => {
    await expect(rewrite({ edit: rewriteTo(hardened), reviewMeaning: async () => response })).rejects.toBeInstanceOf(
      RevisionValidationError
    );
  });
});
