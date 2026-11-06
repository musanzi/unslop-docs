# Unslop-docs product specification

This document records accepted product decisions, including the November 5, 2026 workflow revision. The application is live. The repository implements document support (#15), the API lifecycle (#16), deletion in every state (#11 and #12), and the workspace (#13). The [verification record](evidence/workflow/verification.md) describes the checks and their limits.

The owner accepted replacing the local detector with DeepSeek writing assessment on November 6, 2026. [ADR 0006](adr/0006-assess-writing-patterns-with-deepseek.md) defines the accepted scoring and cleanup scope. [ADR 0007](adr/0007-limit-uploads-to-five-rendered-pages.md) defines the accepted five-page upload limit. Both decisions are implemented in the repository.

## Accounts and allowances

Users sign in with Google only. The admin manually assigns FREE, PREMIUM, or GOLD status.

New users start with FREE status. The `ADMIN_EMAIL` setting identifies the admin's Google account. Each status change records the admin, the date, and the previous and new statuses. The first release has no payment integration.

Admin controls retain user listing and status management. The starter's account-creation, CSV-import, role-assignment, and user-deletion controls are removed. Google sign-in is the only account-creation path.

| Status  | Documents per month |
| ------- | ------------------- |
| FREE    | 3                   |
| PREMIUM | 15                  |
| GOLD    | 35                  |

Usage resets on the first day of each month at 00:00 UTC. Clicking **Unslopify** reserves one slot atomically. A downloadable revised document counts toward usage, and failed rewriting releases its reservation. Status changes apply immediately without resetting usage.

A successful document uses the allowance for the month when its slot was reserved, even if processing finishes the next month. Existing jobs can finish after a status downgrade. New rewrites are blocked when completed documents and active reservations exhaust the current allowance. Deleting a completed document does not restore usage.

Assessment runs automatically after upload and again after rewriting. Neither assessment consumes an additional document slot. There is no separate monthly assessment allowance, assessment purchase, or assessment action. Waiting at the assessment result holds no reservation. Normal request throttling and processing resource limits still apply.

## Documents

The first release accepts DOCX files and returns DOCX files. Each new upload is limited to 10 MB and five pages rendered on the server. Documents can be in English or French. The interface is in English.

Count the entire uploaded document, including cover pages, references, and blank pages. The server's rendered count is authoritative and may differ from Word because of fonts and layout. Do not use saved DOCX page metadata or a word-count approximation to enforce this limit. Preserve existing documents and downloads. A rewritten document that exceeds five pages remains downloadable.

Editing aims to preserve meaning, language, citations, quotations, and factual claims, without inventing evidence or references. Match the uploaded document's formatting as closely as practical, including headings, paragraphs, lists, and tables. Formatting differences do not prevent download. Users review and adjust the DOCX outside the app. PDF input, scanned documents, and exact page-layout preservation are outside the first release.

Convert ordinary Word content controls into their visible text or images. Use the final version of tracked changes, including insertions and excluding deletions. Preserve the original upload separately. Validation and document traversal must both support these conversions; removing the current rejection alone is insufficient.

Preserve images, equations, reference fields, notes, comments, headers, footers, and complex elements unchanged where safe and practical. Identify elements that could not be edited. Do not execute embedded objects or fetch linked resources. Reject unsafe content or unreadable files with a specific explanation; do not treat every unfamiliar formatting feature as unsafe.

Retain the 10 MB limit, English/French support, archive and XML security limits, private access checks, and readable DOCX output checks. The five-page upload limit replaces the 10,000-word product limit. Apply the page restriction only to new uploads.

When a rewritten passage fails checks for quotations, citations, numbers, or references, retain the original passage and continue the rest of the document. A short notice identifies passages left unchanged. These checks do not prove semantic equivalence and do not replace user review.

## Assessment and editing

An accepted upload automatically starts a DeepSeek writing assessment, then waits for the user. Show the **AI-style score** out of 100. It describes writing patterns and does not establish authorship. The workspace does not display or load a document preview. Show unavailable results without a numeric score. Do not show writing-pattern examples. Users can edit documents regardless of the score.

The user chooses rewrite strength, from light edits to thorough rewriting, and clicks **Unslopify**. The slider controls editing extent, not a promised score reduction. Save the chosen strength with the attempt so retries use the same instructions.

After rewriting, assess the revised document automatically using the same scoring method. Show the before and after AI-style scores in separate circles and make the revised DOCX available. There is no second confirmation, assess button, or automatic rewrite loop. A score that stays the same or increases does not block download. If the final assessment fails after bounded retries, retain the usable DOCX and state that its final score is unavailable.

DeepSeek identifies writing problems using the pinned unslop rules in context for English and French. Each finding requires an exact quotation, a rule ID, and a concrete explanation. Application code calculates the score from sentence severity and word count using the formula in ADR 0006. Quotations, citations, reference lists, and code do not contribute to the score, but may provide context. Assess prose in tables as well as ordinary paragraphs. A listed word or punctuation mark alone does not justify a finding.

Show only the number inside each circle, colored green for 0–33, amber for 34–66, and red for 67–100. Accessible labels include the score out of 100 and Low, Moderate, or High severity. Unavailable results stay neutral. The rewrite-strength slider runs from 1 to 100, initially 50, with Light, Balanced, and Thorough labels. Strength does not promise a percentage reduction. Keep the assessment model, rubric version, method, and coverage metadata with each result.

Remove the local detector service, model files, configuration, tests, and stored detector results. Preserve uploaded originals, revised downloads, accounts, and usage history. Do not retain legacy detector results or compare scores across the two methods.

The system uses DeepSeek with a server-side `DEEPSEEK_API_KEY`. Editing instructions come from the [Cursor pstack unslop skill](https://github.com/cursor/plugins/blob/bc697d0a5a163cec979e362b601e36f5616083fd/pstack/skills/unslop/SKILL.md), as selected by the owner. The selected source revision is `bc697d0a5a163cec979e362b601e36f5616083fd`.

Document content is input to assess or edit. It cannot override the assessment or editing instructions.

## Progress and history

Each sidebar entry represents one uploaded document and shows upload, assessment, ready-to-edit, editing, final-assessment, and download-ready states. The sidebar follows the conversation-history layout used by ChatGPT. Retry actions appear in the selected document panel, not in history rows.

Upload progress uses transferred bytes when available. Editing progress uses completed work units, and assessment uses a named indeterminate state when no measurable total exists. Never invent a time-based percentage. Mark the whole operation complete only when the download is ready. Reduced-motion users receive the same information without movement.

The first release has no follow-up chat or repeated revisions within an entry.

## Failures and retries

Temporary provider errors trigger up to two automatic retries after the initial attempt. Users can retry failed stages without duplicate charges. Retain a successful initial assessment when editing fails. Only a rewrite retry needs an available document allowance slot. A final-assessment retry does not repeat editing or reserve another slot.

Deleting an active document prevents later results from being saved and releases any rewrite reservation once. Assessment-only documents have no reservation to release. Deleting a completed document keeps the charge. A request already sent to DeepSeek may finish after deletion. Reloads and repeated clicks must not duplicate work or charges.

## Privacy and retention

Documents remain available until the user deletes them. Downloads are private. The upload interface explains that document text goes to DeepSeek automatically for assessment, even if the user never requests editing. DeepSeek also receives text for user-requested editing and the final assessment. Admin user management does not grant access to document contents.

## Deployment

The first release runs on one server with Docker, PostgreSQL, and Redis. A background worker processes documents. Documents live in a private persistent volume, separate from publicly served uploads.

## Build scope

1. Replace password authentication with Google-only sign-in and configure admin access.
2. Add user statuses, status-change records, and monthly allowance reservations.
3. Add private DOCX uploads, validation, document records, and owner-checked downloads.
4. Add the background worker, DeepSeek assessment, editing instructions, and DOCX output validation.
5. Add the document workspace, sidebar history, progress animations, downloads, and deletion.
6. Adapt admin user management for status changes.
7. Update project branding, setup instructions, environment examples, and Docker configuration.
8. Verify document preservation, private access, allowance boundaries, retries, and deletion during processing.

The [ticket index](ticket-drafts/README.md) records the original implementation slices and follow-up workflow work. The [workflow design](document-workflow-design.md) records the accepted changes. Deployment issue #14 is closed following the owner's confirmation that the app is live. Historical tickets remain records of their original scope; follow-up tickets implement superseding decisions.
