import { describe, expect, it } from 'vitest';
import { assessmentSentences, assessmentText, styleScore, validateStyleAssessment } from './style-assessment';
import { styleAssessmentFixture } from '@api/shared/testing/style-assessment-fixtures';
import { readDocx } from './validate-docx';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';

describe('Evidence-based style scoring', () => {
  it('weights severity by words and leaves an empty denominator unavailable', () => {
    expect(styleScore(100, 30)).toBe(10);
    expect(styleScore(100, 300)).toBe(100);
    expect(styleScore(100, 0)).toBe(0);
    expect(styleScore(0, 0)).toBeNull();
  });
  it('excludes inline quotations, citations, and code without excluding the surrounding prose', () => {
    const text =
      'We measured “a vibrant tapestry” in trials (Smith, 2024). «Une citation.» Results [1, 2] were stable. `return foo`';
    expect(
      assessmentSentences(text)
        .map((s) => s.text)
        .join(' ')
    ).not.toMatch(/tapestry|citation|Smith|return foo/);
    expect(assessmentSentences(text).map((s) => s.wordCount)).toEqual([4, 3]);
  });
  it('retains table prose while excluding reference lists and protected fields', async () => {
    const source = await readDocx(
      await readerFixture(
        textParagraph('Our results are clear.') +
          '<w:tbl><w:tr><w:tc>' +
          textParagraph('Table prose matters.') +
          '</w:tc></w:tr></w:tbl>' +
          textParagraph('References') +
          textParagraph('Smith 2024. Some title.')
      )
    );
    expect(assessmentText(source)).toBe('Our results are clear.\nTable prose matters.');
  });

  it('preserves factual parentheticals and apostrophes while excluding single-quoted passages', () => {
    const result = assessmentSentences("The student's data (collected in 2024) supported 'the quoted phrase'.");
    expect(result[0].text).toContain("student's data (collected in 2024)");
    expect(result[0].text).not.toContain('quoted phrase');
  });
  it('rejects invented scores and invalid coverage', () => {
    const value = styleAssessmentFixture(40).style;
    expect(() => validateStyleAssessment({ ...value, score: 99 })).toThrow();
    expect(() => validateStyleAssessment({ ...value, wordCount: 0 })).toThrow();
    expect(() => validateStyleAssessment({ ...value, weightedSeverity: 301 })).toThrow();
    expect(() => validateStyleAssessment({ ...value, provider: 'local' })).toThrow();
  });
});
