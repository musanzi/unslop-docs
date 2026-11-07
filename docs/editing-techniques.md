# Editing techniques used by Unslopify

Clicking **Unslopify** starts the existing rewrite workflow with the saved strength. Each editing request includes the pinned [Cursor pstack Unslop skill](https://github.com/cursor/plugins/blob/bc697d0a5a163cec979e362b601e36f5616083fd/pstack/skills/unslop/SKILL.md), additional prose-editing instructions, and a final editorial check. The vendored skill remains unchanged and its hash is checked when loaded.

## Additional techniques and sources

These are established writing guidelines adapted to document editing. They are not evidence that a rewrite will achieve a particular AI detection rate.

| Technique                          | Application                                                                                                                                                                 | Source                                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentence variety                   | Vary repetitive openings and sentence structures. Split overloaded sentences or combine choppy ones within the same editable span.                                          | [Purdue OWL: Sentence variety](https://owl.purdue.edu/owl/general_writing/academic_writing/sentence_variety/index.html)                                                                                  |
| Specific transitions               | Connect ideas through information already in the supplied text. Avoid generic transitions and invented logical relationships.                                               | [Purdue OWL: Writing transitions](https://owl.purdue.edu/owl/general_writing/mechanics/transitions_and_transitional_devices/index.html)                                                                  |
| Direct verbs                       | Replace unnecessary noun constructions with verbs, and keep subjects close to their verbs. Retain passive voice when the actor is unknown or the action deserves the focus. | [National Archives: Writing style guide](https://www.archives.gov/files/open/plain-writing/style-guide.pdf), [Plain-language principles](https://www.archives.gov/open/plain-writing/10-principles.html) |
| Precise, concise wording           | Remove redundant framing without deleting claims, qualifications, or necessary technical terms.                                                                             | [Purdue OWL: Concision](https://owl.purdue.edu/owl/general_writing/academic_writing/conciseness/index.html)                                                                                              |
| Appropriate voice and proofreading | Retain the source's register and review the revised prose for clarity and grammatical errors.                                                                               | [National Archives: Plain-language principles](https://www.archives.gov/open/plain-writing/10-principles.html)                                                                                           |

The application adds preservation constraints to these guidelines. Instructions prohibit invented anecdotes, personal experiences, deliberate errors, and changes in certainty. English and French passages retain their language. Academic prose retains its register.

## Author-supplied editing checklist

The owner's additional checklist supplies contextual vocabulary cues, formulaic sentence patterns, and examples of better edits. Instructions distinguish empty intensifiers from meaningful qualifications, rhetorical contrasts from actual distinctions, and decorative triplets from factual enumerations. Technical terms such as "robust estimator" remain valid even when a word appears on the review list.

Examples show plain verbs, direct statements, French filler removal, and mistakes to avoid. They illustrate the editing rules and supply no facts for the document. Names, measurements, incidents, constraints, opinions, and local phrasing must come from the source. The model cannot supply the author's experience or choose a new position on the author's behalf.

Structure advice applies within the existing editable spans. Empty introduction and recap framing can be removed while retaining the information. Existing document blocks, headings, lists, bold, and italics remain subject to the preservation rules. Rewriting does not convert the document into a different layout or force sections to have equal length. Editable punctuation follows the pinned Unslop skill; quotation punctuation stays unchanged.

The final checklist covers fidelity, style, cadence, and restraint. A silent reading check asks the model to catch unnatural wording without turning formal writing into casual speech. These are model instructions, not a separate rule-based linter or an independent verification pass. Advice about drafting personally and supplying new experiences remains an author task.

## Strength behavior

| Strength         | Editing extent                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Light, 1–33      | Fix conspicuous Unslop patterns and local clarity problems. Keep most wording and sentence structure.                                |
| Balanced, 34–66  | Recast sentences with Unslop patterns, unclear connections, or repetitive rhythm. Retain sentences that already read naturally.      |
| Thorough, 67–100 | Rewrite complete prose sentences, including those without listed patterns, using new sentence structures where preservation permits. |

Preservation rules override every technique and strength instruction. Edits stay within their supplied spans and do not restructure document blocks. The final editorial check asks the model to compare each revision with its source before returning JSON. This is part of the same response, not another provider call or a detector-driven rewrite loop.

## Implementation and validation

[`editing-techniques.ts`](../apps/api/src/modules/documents/editing-techniques.ts) contains the added instructions. [`document-workflow.ts`](../apps/api/src/modules/documents/document-workflow.ts) combines them with the pinned skill and the chosen strength. Existing validation retains source passages when protected-content checks fail and records revision notices.

Worker tests cover the strength boundaries, the instructions sent to the provider, completion, the original assessment, and a single allowance charge. DOCX tests cover English and French preservation at all three strengths. These tests use controlled provider responses; they verify integration and document handling, not the quality of live model output. Semantic fidelity and naturalness still require review of actual rewrites.

## Live evaluation on November 7, 2026

A live evaluation of one 6,070-word English chapter found modest copyediting rather than thorough rewriting at strength 100. The running worker's instruction files matched the checkout. The configured model was `deepseek-flash`, with temperature zero and thinking disabled. The downloaded revision and its re-upload had identical assessed-text hashes.

| Version                                              | Oculus score out of 100 | Changed prose paragraphs |
| ---------------------------------------------------- | ----------------------- | ------------------------ |
| Original                                             | 93.26                   | Not applicable           |
| User's downloaded revision                           | 93.96                   | 30 of 48                 |
| Fresh rewrite with the current instructions          | 93.02                   | 30 of 48                 |
| Same fresh output with corrected preservation checks | 92.86                   | 35 of 48                 |

The paragraph count includes paragraphs with at least 30 whitespace-delimited words. It measures editing extent, not quality. The detector reproduced the original and downloaded-revision scores exactly on replay. The fresh rewrite used 14 provider requests. It is a separate generation, while the validation comparison reuses those exact responses to isolate the effect of the checks.

Reading the original and revisions showed useful grammar and clarity edits alongside superficial synonym substitutions and long unchanged stretches. This assessment comes from one chapter and an agent review, not a blinded human study. The results do not establish that the current prompt improves naturalness overall or reliably reduces detector scores.

Three validation defects caused false fallbacks: a lowercase modal "may" matched the month May; ordinary uses of "source" and "according to" matched reference prose; and a leading "As" became part of a narrative citation's author list. Fixes recover five of six rejected passages in the fresh run. The remaining passage changes citation order and still falls back. Tests retain rejection of altered dates, named attributions, and citation authors and years.

Two prompt experiments each used three existing chunks covering 12 substantial prose spans. One moved the unchanged strength instruction to the end. The other added an explicit instruction to compose new sentences from the same information. Both retained the pinned skill and used the same configured model. Neither established a material prose-quality improvement, so neither prompt change was adopted. The small score change after correcting validation does not resolve the rewriting limitation.

The owner then requested a score of 10 or below. Thirteen further variants were tested on the same three source passages, which scored 97.00 together. The variants included shorter prompts, examples, authorial voice, concision, claim notes, editorial feedback, temperature changes, thinking mode, and the available `deepseek-v4-pro` model. The best draft that passed protected-content checks scored 94.72. The lowest raw draft scored 90.83 but introduced numbered labels and failed a fact check. These are passage-level results, not full-document scores. No variant established the requested passing result, and none was adopted in the application.

## Repeat the evaluation

[`evaluate-document-rewrite.cjs`](../tools/evaluate-document-rewrite.cjs) runs the real workflow without creating document jobs or allowance reservations. It requires the worker's compiled modules and configured detector. Rewrite mode also requires the configured DeepSeek credentials and makes paid requests.

```sh
node tools/evaluate-document-rewrite.cjs compare ORIGINAL.docx REVISED.docx OUTPUT_DIRECTORY
node tools/evaluate-document-rewrite.cjs rewrite ORIGINAL.docx OUTPUT_DIRECTORY 100
```

The output directory contains private document text, proposed and accepted edits, instructions, notices, and measurements. Keep it outside version control. Exit code 2 means the revised detector score did not decrease, code 3 means a score was unavailable, and code 1 means evaluation failed. A zero exit code reports a score decrease only; it does not certify better prose or preserved meaning. The script never publishes a revision to the app.
