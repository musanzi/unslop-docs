# Document workflow revision

This document records the workflow accepted in the November 5, 2026 design interview, and the changes that later decisions made to it. All of the work is implemented:

- Issue #15 implemented the document-support changes. See the [DOCX support reference](document-support.md).
- Issue #16 implemented the API lifecycle, including reservation at Unslopify, phase-aware retries, and progress data. See the [worker reference](assessment-worker.md).
- Issues #11 and #12 implemented deletion.
- Issue #13 implemented the workspace flow.

The November 6 follow-up interview settled a rendered-page upload limit, recorded in [ADR 0007](adr/0007-limit-uploads-to-five-rendered-pages.md). [ADR 0008](adr/0008-raise-the-upload-limit-to-thirty-rendered-pages.md) raised that limit to thirty pages. [ADR 0009](adr/0009-score-the-ai-detection-rate-with-oculus.md) replaced the DeepSeek writing assessment with the Oculus detector and removed the second assessment after rewriting.

## Requested behavior

The user uploads a document and sees upload progress. AI detection starts automatically. The user then sees the AI detection rate, chooses a rewrite strength with a slider, and clicks **Unslopify**. Editing shows progress until the revised DOCX is ready to download. The user takes no further action before the download.

Ordinary Word content controls must not force the user to convert the document by hand before uploading it. Blocking checks focus on length and security. Formatting differences alone must not prevent a download. The output matches the style of the uploaded document as closely as practical, and the user can adjust the downloaded document.

The owner confirms that the app is live and closed [deployment issue #14](https://github.com/musanzi/unslop-docs/issues/14). That closure does not verify every item in the issue's historical checklist.

## Confirmed decisions

### Rate display

The displayed rate is the **AI detection rate**, the Oculus model score for the original. The owner removed the explanatory sentence from the interface on November 6. The rate is the only result shown, in one circle, before and after rewriting. The circle is green for 0 to 33, amber for 34 to 66, and red for 67 to 100.

On November 6, the owner also removed the document preview from the workspace. The frontend neither displays nor requests a preview. Users download the revised DOCX and adjust it outside the app. Retry appears only in the selected document panel, not in the sidebar.

### Limits

New uploads have a limit of 10 MB and thirty pages rendered on the server, and they must be in English, French, or both. Cover pages, references, and blank pages count. The page limit replaces the earlier 10,000-word product limit. Existing documents stay available, and revised downloads can exceed thirty pages.

### Rewrite strength

The slider controls rewrite strength, from light edits to thorough rewriting. It does not promise a specific reduction, and the revised document is not rated.

### Content checks

If a rewritten passage fails checks for quotations, citations, numbers, or references, the original passage stays and the rest of the document is finished. A short notice identifies the passages left unchanged. Formatting differences never block a download. These checks do not prove that all factual meaning is preserved, so the user still reviews the output.

### Allowance

AI detection does not consume or reserve a document allowance slot. One slot is reserved atomically when the user clicks **Unslopify** and charged only when the revised document is ready. Waiting at the detection result holds no reservation. Detection is an automatic part of the document flow, with no separate allowance or action. Normal request throttling and processing resource limits still apply.

### Content controls and tracked changes

Ordinary Word content controls become their visible text or images automatically. Tracked changes use the final version, with insertions included and deletions excluded. The original stays available for download. Complex elements stay unchanged where possible, and the app identifies elements it could not edit. Security checks still apply to preserved elements.

## Conflicts with the earlier design

The original product specification started assessment and editing automatically after upload, and ADR 0003 originally published the assessment and revised file together. [ADR 0005](adr/0005-separate-assessment-from-user-requested-editing.md) supersedes that lifecycle and allowance policy. PostgreSQL remains the lifecycle store.

Before issue #15, the upload validator rejected all Word content controls, the document reader rejected unsupported wrappers, and output checks required strict preservation of document structures and formatting. Issue #15 resolved these conflicts. It normalizes controls and tracked changes before modeling, and it keeps passages that fail a content check instead of failing the document.

## Implementation defaults

The [product specification](product-spec.md) defines a 0 to 100 AI detection rate and a 1 to 100 rewrite-strength slider that starts at 50. The strength labels are Light, Balanced, and Thorough. These values are implementation defaults, not exact settings that the user selected.

Do not loop until a rate improves, and do not block a download because of a rate.

Each document entry keeps one revision. An editing retry keeps the detection result and strength. Duplicate clicks and reloads must not create extra attempts or charges. Detection-only processing needs no rewrite reservation. The document allowance stays at FREE 3, PREMIUM 15, and GOLD 35 completed rewrites per UTC month.

## Issue impact

ADR 0009 came after these issues. It removed the final assessment and the before-and-after circles that they describe.

[Issue #13](https://github.com/musanzi/unslop-docs/issues/13) covers upload, assessment, the rate circles and slider, the state that waits for the user, editing, final assessment, and the download-ready state. Progress indicators separate real upload progress from processing progress. The workspace shows these elements:

- Upload bytes, and named phases with editing progress from the API.
- The rate, the rewrite-strength slider, and **Unslopify**.
- Revision notices, retries per phase, and compact history rows.
- A one-time completion animation that respects reduced motion.

[Issue #11](https://github.com/musanzi/unslop-docs/issues/11) covers deletion of stored, failed, and completed documents, and of documents that wait for the user after assessment. [Issue #12](https://github.com/musanzi/unslop-docs/issues/12) covers deletion during assessment or editing, including automatic-retry waits. Deleting an assessed document releases nothing, because it holds no reservation. Deleting active editing releases its reservation unless completion has already charged it.

[Issue #15](https://github.com/musanzi/unslop-docs/issues/15) covers content controls, tracked changes, and the fallback for formatting and content failures. [Issue #16](https://github.com/musanzi/unslop-docs/issues/16) covers automatic assessments, scoring, explicit editing, allowance changes, retry behavior, and progress data. The original validation, assessment, and editing tickets stay closed as historical work. Issues #11, #12, and #13 depend on the lifecycle in #16, which depends on #15.
