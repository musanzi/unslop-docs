import { describe, expect, it } from 'vitest';
import { assessmentText, detectionRate, validateDetection } from './detection-rate';
import { detectionFixture } from '@api/shared/testing/detection-fixtures';
import { readDocx } from './validate-docx';
import { readerFixture, textParagraph } from '@api/shared/testing/docx-reader-fixture';

describe('AI detection rate', () => {
  it('scales the model score to a whole rate out of 100', () => {
    expect(detectionRate(0.933)).toBe(93);
    expect(detectionRate(0)).toBe(0);
    expect(detectionRate(1)).toBe(100);
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

  it('rejects invented rates, other models and invalid coverage', () => {
    const value = detectionFixture(40);
    expect(validateDetection(value)).toEqual(value);
    expect(() => validateDetection({ ...value, rate: 99 })).toThrow();
    expect(() => validateDetection({ ...value, aiScore: 1.1 })).toThrow();
    expect(() => validateDetection({ ...value, segmentCount: 0 })).toThrow();
    expect(() => validateDetection({ ...value, method: 'provenance-style-v1' })).toThrow();
    expect(() => validateDetection({ ...value, modelVersion: 'unverified' })).toThrow();
  });
  it('accepts an unavailable result only without a rate', () => {
    const value = { ...detectionFixture(40), status: 'unavailable', rate: null, aiScore: null, reason: 'too_short' };
    expect(validateDetection(value)).toMatchObject({ status: 'unavailable', rate: null, reason: 'too_short' });
    expect(() => validateDetection({ ...value, rate: 0 })).toThrow();
    expect(() => validateDetection({ ...value, reason: null })).toThrow();
  });
});
