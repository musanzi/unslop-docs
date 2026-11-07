import { describe, expect, it } from 'vitest';
import { validateChunkResult } from './revise-docx';

describe('Editing around protected evidence', () => {
  it.each([
    ['The managers may disagree.', 'The managers might disagree.'],
    ['Functions are included according to access.', 'Functions are included as access allows.'],
    ['The source, date and purpose will be recorded.', 'We will record the source, date and purpose.'],
    [
      'We separate notes as recommended by Emerson et al. (2011).',
      'As Emerson et al. (2011) recommend, we separate notes.'
    ],
    ['According to Jones, the tool is useful.', 'According to Jones, the tool has practical value.'],
    ['Selon Dupont, cet outil est utile.', 'Selon Dupont, cet outil a une utilité pratique.']
  ])('accepts a faithful edit without a false preservation fallback: %s', (original, revised) => {
    const result = validateChunkResult(
      { id: 'chunk', spans: [{ id: 'span', text: original }] },
      {
        edits: [{ id: 'span', text: revised }]
      }
    );
    expect(result).toEqual([{ id: 'span', text: revised }]);
  });

  it.each([
    ['We will meet in May.', 'We will meet in June.', 'fact'],
    ['We will meet in may.', 'We will meet in june.', 'fact'],
    ['We will meet on 12 may 2026.', 'We will meet on 12 june 2026.', 'fact'],
    ['We will meet in May 2026.', 'We will meet in May 2027.', 'fact'],
    ['We will meet in May.', 'We will meet soon.', 'fact'],
    ['According to Jones, the tool is useful.', 'According to Smith, the tool is useful.', 'reference'],
    ['The tool is useful.', 'According to Jones, the tool is useful.', 'reference'],
    ['Selon Dupont, cet outil est utile.', 'Selon Durand, cet outil est utile.', 'reference'],
    ['Source: Jones report.', 'Source: Smith report.', 'reference'],
    [
      'As Emerson et al. (2011) recommend, we separate notes.',
      'As Smith et al. (2011) recommend, we separate notes.',
      'citation'
    ],
    [
      'As Emerson et al. (2011) recommend, we separate notes.',
      'As Emerson et al. (2012) recommend, we separate notes.',
      'citation'
    ]
  ])('still rejects changed evidence: %s', (original, revised, check) => {
    const result = validateChunkResult(
      { id: 'chunk', spans: [{ id: 'span', text: original }] },
      {
        edits: [{ id: 'span', text: revised }]
      }
    );
    expect(result).toEqual([{ id: 'span', text: original, kept: check }]);
  });
});
