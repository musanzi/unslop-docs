# Document workflow revision

This document records the accepted workflow from the November 5, 2026 design interview. The interview is complete. Issue #15 implemented the document-support changes; see the [DOCX support reference](document-support.md). Issue #16 implemented the API lifecycle: automatic initial and final assessments with a scored rubric, the Unslopify request with rewrite strength, reservation at Unslopify, phase-aware retries, and progress data; see the [worker reference](assessment-worker.md). Issues #11–#13 remain open.

## Requested behavior

The user uploads a document and sees upload progress. Assessment starts automatically. The user then sees the document and its score, chooses rewrite strength with a slider, and clicks **Unslopify**. Editing and a second automatic assessment show progress until the revised DOCX is ready to download. No further user action is required before download.

Ordinary Word content controls must not force the user to convert the document manually before uploading it. Blocking checks focus on length and security. Formatting differences alone must not prevent download. The output should match the uploaded document's style as closely as practical, and the user can adjust the downloaded document.

The owner confirms that the app is live. [Deployment issue #14](https://github.com/musanzi/unslop-docs/issues/14) was closed at the owner's request. This does not independently verify every item in its historical checklist.

## Confirmed decisions

The displayed rate is an estimated **AI-style score**. The interface explains that it measures writing patterns rather than proving who wrote the document. It does not use an external AI-authorship detector.

The document preview is read-only and appears alongside the score. Users download the revised DOCX and adjust it outside the app.

The existing limits remain: 10 MB, 10,000 words, and English/French. Formatting-based rejection is removed. These decisions describe the intended revision, not the current implementation.

The slider controls rewrite strength, from light edits to thorough rewriting. It does not promise a specific score reduction. The resulting assessment reports the observed AI-style score after editing.

If a rewritten passage fails checks for quotations, citations, numbers, or references, retain the original passage and finish the rest of the document. Identify passages left unchanged in a short notice. Formatting differences never block download. These checks do not prove that all factual meaning has been preserved, so the user still reviews the output.

Assessment does not consume or reserve an additional document allowance slot. Reserve one slot atomically when the user clicks **Unslopify**, and charge it only when the revised document is ready. Waiting at the preview does not hold a reservation. The owner clarified that assessment is an automatic part of the document flow, before and after rewriting. There is no separate assessment allowance or action. Normal request throttling and processing resource limits still apply.

Convert ordinary Word content controls into their visible text or images automatically. For tracked changes, use the final version: include insertions and exclude deletions. Keep the original available for download. Preserve complex elements unchanged where possible, and identify elements that could not be edited. Security checks still apply to preserved elements.

## Conflicts with the existing design

The existing assessment produces writing-pattern examples without a numerical score. The glossary now defines the accepted AI-style score separately from an AI-authorship percentage. Assessment and its presentation need to support that score.

The original product specification starts assessment and editing automatically after upload. ADR 0003 originally published the assessment and revised file together. [ADR 0005](adr/0005-separate-assessment-from-user-requested-editing.md) supersedes that lifecycle and allowance policy. PostgreSQL remains the lifecycle store, but these transitions must change.

Before issue #15, the upload validator rejected all Word content controls, the document reader rejected unsupported wrappers, and output checks required strict preservation of document structures and formatting. Issue #15 resolved these conflicts by normalizing controls and tracked changes before modeling and by keeping passages that fail a content check instead of failing the document.

## Implementation defaults

The [product specification](product-spec.md) defines a 0–100 estimated AI-style score and a 1–100 rewrite-strength slider initially set to 50. Strength labels are Light, Balanced, and Thorough. These are implementation defaults, not a claim that the user selected exact numerical settings.

Use the same versioned, document-wide scoring rubric before and after editing. A capped list of examples is not a denominator for a percentage. Do not force a lower score, loop until the score improves, or block download because it did not improve. If the final assessment exhausts its bounded retries, offer the usable document with an unavailable-score notice.

Keep one revision per document entry. An editing retry retains the initial assessment and strength. Duplicate clicks and reloads must not create extra attempts or charges. Assessment-only processing needs no rewrite reservation. The normal document allowance remains FREE 3, PREMIUM 15, and GOLD 35 completed rewrites per UTC month.

## Issue impact

[Issue #13](https://github.com/musanzi/unslop-docs/issues/13) covers upload, assessment, the preview and slider, awaiting-user-action, editing, final assessment, and download-ready states. Progress indicators distinguish actual upload progress from processing progress.

[Issue #11](https://github.com/musanzi/unslop-docs/issues/11) needs to cover deletion after assessment while the document waits for the user. [Issue #12](https://github.com/musanzi/unslop-docs/issues/12) needs to cover deletion during either assessment or editing. Deleting an assessment or its preview releases no document allowance because neither holds a reservation. Deleting active editing releases its reservation unless completion has already charged it.

[Issue #15](https://github.com/musanzi/unslop-docs/issues/15) covers content controls, tracked changes, and tolerant formatting and content fallback. [Issue #16](https://github.com/musanzi/unslop-docs/issues/16) covers automatic initial and final assessments, scoring, explicit editing, allowance changes, retry behavior, and progress data. The original validation, assessment, and editing tickets remain closed as historical work. Issues #11–#13 depend on the revised lifecycle in #16, which depends on #15.
