# Assess uploads, wait for Unslopify, and assess the revised result

## What to build

Replace automatic assessment-and-editing with this durable flow: upload, automatic initial assessment, preview awaiting the user, Unslopify with rewrite strength, rewriting, automatic final assessment, download. The original assessment currently has no numeric score and is published only with the revision. Users need the initial result before choosing to rewrite.

Assessment is part of processing a document. There is no separate assessment action, plan allowance, or charge. This supersedes relevant lifecycle and allowance criteria in closed issues #6, #7, #9, and #10. Keep the PostgreSQL lifecycle store and checkpoint protections.

## Acceptance criteria

- [ ] A valid upload queues only initial assessment. Publish the assessment and an owner-only read-only preview independently of any revised file. Do not edit before an explicit Unslopify request.
- [ ] Assess writing patterns using a versioned, document-wide rubric. Return a validated 0–100 estimated AI-style score with supporting examples. The rubric addresses repetitive phrasing, generic filler, formulaic transitions, and inflated language. It does not estimate authorship. Do not calculate a percentage from the existing capped example count.
- [ ] Final assessment uses the same rubric version and document coverage, reads the actual revised text, and cannot use strength or the old score to fabricate improvement. Reject malformed provider results and use bounded retries. Retain provider privacy and prompt-injection protections.
- [ ] Add an owner-checked Unslopify action valid only for an assessed document. Accept integer rewrite strength from 1 to 100, default 50. Persist it with the attempt. Low strength requests light edits; higher strength permits broader rewriting while preserving facts and meaning.
- [ ] Reserve exactly one document allowance slot in the same transaction that queues rewriting. Initial assessment and the idle preview hold none. Keep FREE 3, PREMIUM 15, and GOLD 35 completed rewrites per UTC month and reservation-month charging. Out-of-allowance requests leave the preview available and queue no editing.
- [ ] Assess the completed rewrite automatically, then publish its download with both assessments. No extra confirmation, assess action, separate assessment allowance, or automatic rewrite-until-score loop exists.
- [ ] An unchanged or higher final score does not reject the DOCX. If final assessment exhausts retries or the remaining deadline, publish an already validated, usable revision with an unavailable-score notice. Never fabricate a score or discard a usable revision solely because assessment failed.
- [ ] Charge only once when the revised download is ready. Failure before usable output releases the rewrite reservation. Repeated clicks, retries, worker recovery, and concurrent requests cannot duplicate work or charges.
- [ ] A failed initial assessment retries without reserving a rewrite slot. A failed rewrite retains its initial assessment and selected strength. Final-assessment retries reuse the validated revision and do not rerun editing or reserve another slot.
- [ ] Initial assessment and rewriting have bounded active deadlines; waiting for the user has none. The rewrite deadline includes final assessment. PostgreSQL claims and checkpoints distinguish initial assessment, editing chunks, and final assessment. Initial assessment requires no rewrite reservation.
- [ ] Expose durable phase and completed/total editing work for the workspace. Use indeterminate assessment progress when no measurable total exists. Reloading never restarts completed work. Retain request throttling and resource limits without adding a monthly assessment counter.
- [ ] Keep one revision per entry, owner-only reads/downloads, private previews, and sanitized errors. Existing completed documents remain downloadable. Define and test migration behavior for legacy assessed and active documents; do not reinterpret old scores or leave old reservations stranded.
- [ ] Tests cover the pause after assessment, last-slot races, duplicate Unslopify clicks, retry reuse, month boundaries, restart recovery, missing final score, and higher final score. Update OpenAPI contracts, worker documentation, and README. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`.

## Blocked by

- #15: Accept common Word documents and tolerate formatting differences.
