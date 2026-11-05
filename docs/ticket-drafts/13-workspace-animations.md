# 13: Show document preview, rewrite strength, and processing progress

## What to build

Deliver the accepted upload-to-download flow: upload with progress, automatic initial assessment, read-only preview and estimated AI-style score, rewrite-strength slider, Unslopify, editing and automatic final-assessment progress, then revised download. This expands the original animation issue to cover the complete workspace interaction.

## Acceptance criteria

- [ ] Show upload progress from transferred bytes when available, with a transition to automatic assessment. Use an indeterminate indicator if a total is unavailable. Upload completion must not imply processing completion.
- [ ] After initial assessment, show a private read-only preview with headings, paragraphs, lists, tables, and safe images where supported. Match the uploaded style as closely as practical without promising exact Word pagination. Sanitize rendered content and do not load external document resources.
- [ ] Show only the estimated AI-style score on a 0–100 scale as the assessment result, with a one-line explanation that it measures writing patterns and does not prove AI authorship. Do not render the writing-pattern example list anywhere in the workspace, even though the API may still return it. Keep score and processing progress visually distinct.
- [ ] Provide an accessible keyboard-operable Rewrite strength slider from 1 to 100, default 50, with Light, Balanced, and Thorough labels. Do not promise a percentage reduction. The user can start regardless of the initial score.
- [ ] Unslopify sends the selected strength once. Disable duplicate submission while pending, show allowance errors beside the action, and retain the preview after refusal. Reloads and navigation do not start work.
- [ ] Display queued, assessing, ready-to-edit, editing, checking-result, and download-ready phases in the main panel and history. A ready-to-edit document has no spinner suggesting background work continues.
- [ ] Editing progress reflects completed work units supplied by the API. Assessment phases use named indeterminate indicators unless measurable progress exists. Do not simulate elapsed-time percentages or show overall 100% before the download is ready.
- [ ] After automatic final assessment, show the actual before/after scores only, original and revised downloads, and notices for retained passages or unedited elements. There is no extra assess button, assessment allowance, confirmation, or in-app editor.
- [ ] The completed view is polished and designed rather than a stack of plain cards, with completion animations that respect reduced motion. Below the downloads keep only the sentence "Review the revised document before submitting it." and remove the text that followed it.
- [ ] History entries follow the ChatGPT-style conversation-history layout: compact rows with the filename on one line, a small status and date line, and the delete action as a small icon button inside the row that appears on hover or focus, stays reachable by keyboard, carries an aria-label naming the file, and does not shift the row. The confirmation dialog, focus handling, and empty state from #11 and #12 keep working.
- [ ] An unchanged or higher score still permits download. If the final score is unavailable after retries, show that fact beside the usable download without a misleading success claim about the score.
- [ ] Failed initial assessment and failed editing show the appropriate retry action. Preserve initial assessment after editing failure. Recovery does not require re-upload.
- [ ] The completion animation plays once when a document completes while the user is watching. It does not replay on reload or when the user opens an older entry.
- [ ] With `prefers-reduced-motion: reduce`, no element moves, pulses, or loops. Static indicators show the same states.
- [ ] Each state has visible text, so color and motion never carry the meaning alone.
- [ ] A polite live region announces phase changes once each, not every progress update or animation frame.
- [ ] Animations do not shift the layout of the sidebar or the main panel, and they work at phone width.
- [ ] Server rendering of the workspace works with no browser-only animation errors.
- [ ] The preview, slider, actions, and history work with keyboard navigation.
- [ ] Failed states show without a celebratory or looping animation.
- [ ] Meaningful interaction tests cover waiting before Unslopify, strength submission, duplicate clicks, progress phases, final-score failure, and download-ready behavior. `pnpm lint`, `pnpm typecheck`, and `pnpm test:web` pass. Update the README when implemented.
- [ ] The pull request includes a recording of a full run, and a recording or screenshots with reduced motion on.

## Blocked by

- 07: Unslop a document into a revised DOCX
- #16: Assess uploads, wait for Unslopify, and assess the revised result.
