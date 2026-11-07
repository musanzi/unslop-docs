# Document workflow revision

This document records the accepted workflow from the November 5, 2026 design interview. The interview is complete. Issue #15 implemented the document-support changes; see the [DOCX support reference](document-support.md). Issue #16 implemented the API lifecycle: automatic initial and final assessments with a scored rubric, the Unslopify request with rewrite strength, reservation at Unslopify, phase-aware retries, and progress data; see the [worker reference](assessment-worker.md). Issues #11 and #12 implemented deletion, and issue #13 implemented the workspace flow.

The November 6 follow-up interview settled a rendered-page upload limit, recorded in [ADR 0007](adr/0007-limit-uploads-to-five-rendered-pages.md) and raised to thirty pages by [ADR 0008](adr/0008-raise-the-upload-limit-to-thirty-rendered-pages.md). [ADR 0009](adr/0009-score-the-ai-detection-rate-with-oculus.md) replaces its DeepSeek writing assessment with the Oculus detector.

## Requested behavior

The user uploads a document and sees upload progress. Assessment starts automatically. The user then sees the AI Rate, chooses rewrite strength with a slider, and clicks **Unslopify**. Editing and a second automatic assessment show progress until the revised DOCX is ready to download. No further user action is required before download.

Ordinary Word content controls must not force the user to convert the document manually before uploading it. Blocking checks focus on length and security. Formatting differences alone must not prevent download. The output should match the uploaded document's style as closely as practical, and the user can adjust the downloaded document.

The owner confirms that the app is live. [Deployment issue #14](https://github.com/musanzi/unslop-docs/issues/14) was closed at the owner's request. This does not independently verify every item in its historical checklist.

## Confirmed decisions

The displayed rate is the **AI detection rate**, the Oculus model score for the original. The owner removed the explanatory sentence from the interface on November 6. The rate is the only result shown, in one circle, before and after rewriting.

On November 6, the owner removed the document preview from the workspace. The frontend neither displays nor requests a preview. Users download the revised DOCX and adjust it outside the app. The AI Rate appears inside a circle colored by severity: green for 0–33, amber for 34–66, and red for 67–100. Completed documents show before and after circles. Retry appears only in the selected document panel, not the sidebar.

The accepted limits are 10 MB, thirty pages rendered on the server for new uploads, and English/French. Count cover pages, references, and blank pages. The page limit replaces the earlier 10,000-word product limit. Existing documents remain available, and revised downloads can exceed thirty pages. Formatting differences alone do not prevent download. These decisions describe the intended revision, not the current implementation.

The slider controls rewrite strength, from light edits to thorough rewriting. It does not promise a specific reduction, and the revised document is not rated.

If a rewritten passage fails checks for quotations, citations, numbers, or references, retain the original passage and finish the rest of the document. Identify passages left unchanged in a short notice. Formatting differences never block download. These checks do not prove that all factual meaning has been preserved, so the user still reviews the output.

Assessment does not consume or reserve an additional document allowance slot. Reserve one slot atomically when the user clicks **Unslopify**, and charge it only when the revised document is ready. Waiting at the assessment result does not hold a reservation. The owner clarified that assessment is an automatic part of the document flow, before and after rewriting. There is no separate assessment allowance or action. Normal request throttling and processing resource limits still apply.

Convert ordinary Word content controls into their visible text or images automatically. For tracked changes, use the final version: include insertions and exclude deletions. Keep the original available for download. Preserve complex elements unchanged where possible, and identify elements that could not be edited. Security checks still apply to preserved elements.

## Conflicts with the existing design

The original product specification starts assessment and editing automatically after upload. ADR 0003 originally published the assessment and revised file together. [ADR 0005](adr/0005-separate-assessment-from-user-requested-editing.md) supersedes that lifecycle and allowance policy. PostgreSQL remains the lifecycle store, but these transitions must change.

Before issue #15, the upload validator rejected all Word content controls, the document reader rejected unsupported wrappers, and output checks required strict preservation of document structures and formatting. Issue #15 resolved these conflicts by normalizing controls and tracked changes before modeling and by keeping passages that fail a content check instead of failing the document.

## Implementation defaults

The [product specification](product-spec.md) defines a 0–100 AI detection rate and a 1–100 rewrite-strength slider initially set to 50. Strength labels are Light, Balanced, and Thorough. These are implementation defaults, not a claim that the user selected exact numerical settings.

Do not loop until a rate improves, and do not block download because of a rate.

Keep one revision per document entry. An editing retry retains the initial assessment and strength. Duplicate clicks and reloads must not create extra attempts or charges. Assessment-only processing needs no rewrite reservation. The normal document allowance remains FREE 3, PREMIUM 15, and GOLD 35 completed rewrites per UTC month.

## Issue impact

[Issue #13](https://github.com/musanzi/unslop-docs/issues/13) covers upload, assessment, the AI Rate circles and slider, awaiting-user-action, editing, final assessment, and download-ready states. Progress indicators distinguish actual upload progress from processing progress. It is implemented: the workspace shows upload bytes, named phases with editing progress from the API, the score-only assessment, the rewrite-strength slider, Unslopify, before and after scores, revision notices, retries per phase, compact history rows, and a one-time completion animation that respects reduced motion.

[Issue #11](https://github.com/musanzi/unslop-docs/issues/11) covers deletion after assessment while the document waits for the user, and of stored, failed, and completed documents. [Issue #12](https://github.com/musanzi/unslop-docs/issues/12) covers deletion during either assessment or editing, including automatic-retry waits and the final assessment. Both are implemented. Deleting an assessed document releases no document allowance because it holds no reservation. Deleting active editing releases its reservation unless completion has already charged it.

[Issue #15](https://github.com/musanzi/unslop-docs/issues/15) covers content controls, tracked changes, and tolerant formatting and content fallback. [Issue #16](https://github.com/musanzi/unslop-docs/issues/16) covers automatic initial and final assessments, scoring, explicit editing, allowance changes, retry behavior, and progress data. The original validation, assessment, and editing tickets remain closed as historical work. Issues #11–#13 depend on the revised lifecycle in #16, which depends on #15.
