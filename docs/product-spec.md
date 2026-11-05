# Unslop-docs product specification

This document records accepted product decisions, including the November 5, 2026 workflow revision. The application is live. Issues #15 and #16 implemented the document support and the API lifecycle below, and #11 and #12 implemented deletion in every state; the workspace presentation (#13) is still open. This specification is not a completion report.

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

Assessment runs automatically after upload and again after rewriting. Neither assessment consumes an additional document slot. There is no separate monthly assessment allowance, assessment purchase, or assessment action. Waiting at the preview holds no reservation. Normal request throttling and processing resource limits still apply.

## Documents

The first release accepts DOCX files and returns DOCX files. Each upload is limited to 10 MB and 10,000 words. Documents can be in English or French. The interface is in English.

Editing aims to preserve meaning, language, citations, quotations, and factual claims, without inventing evidence or references. Match the uploaded document's formatting as closely as practical, including headings, paragraphs, lists, and tables. Formatting differences do not prevent download. Users review and adjust the DOCX outside the app. PDF input, scanned documents, and exact page-layout preservation are outside the first release.

Convert ordinary Word content controls into their visible text or images. Use the final version of tracked changes, including insertions and excluding deletions. Preserve the original upload separately. Validation and document traversal must both support these conversions; removing the current rejection alone is insufficient.

Preserve images, equations, reference fields, notes, comments, headers, footers, and complex elements unchanged where safe and practical. Identify elements that could not be edited. Do not execute embedded objects or fetch linked resources. Reject unsafe content or unreadable files with a specific explanation; do not treat every unfamiliar formatting feature as unsafe.

Retain the 10 MB and 10,000-word limits, English/French support, archive and XML security limits, private access checks, and readable DOCX output checks. Count normalized main-body text, including controls and tables, so wrappers cannot bypass the word limit.

When a rewritten passage fails checks for quotations, citations, numbers, or references, retain the original passage and continue the rest of the document. A short notice identifies passages left unchanged. These checks do not prove semantic equivalence and do not replace user review.

## Assessment and editing

An accepted upload automatically starts a writing assessment. Publish its estimated AI-style score beside a read-only document preview, then wait for the user. Show only the score as the assessment result, with a one-line explanation that it measures writing patterns and does not prove AI authorship; the interface does not list writing-pattern examples. Users can edit documents regardless of the score.

The user chooses rewrite strength, from light edits to thorough rewriting, and clicks **Unslopify**. The slider controls editing extent, not a promised score reduction. Save the chosen strength with the attempt so retries use the same instructions.

After rewriting, assess the revised document automatically using the same scoring method. Show the before and after scores only and make the revised DOCX available. There is no second confirmation, assess button, or automatic rewrite loop. A score that stays the same or increases does not block download. If the final assessment fails after bounded retries, retain the usable DOCX and state that its final score is unavailable.

Implementation defaults are a 0–100 estimated AI-style score and a rewrite-strength slider from 1 to 100, initially 50. Show Light, Balanced, and Thorough labels; do not label strength as a percentage reduction. Use a versioned scoring rubric for document-wide assessment. Do not derive a percentage from the existing capped example list or invent a lower result from the selected strength.

The system uses DeepSeek with a server-side `DEEPSEEK_API_KEY`. Editing instructions come from the [Cursor pstack unslop skill](https://github.com/cursor/plugins/blob/bc697d0a5a163cec979e362b601e36f5616083fd/pstack/skills/unslop/SKILL.md), as selected by the owner. The selected source revision is `bc697d0a5a163cec979e362b601e36f5616083fd`.

Document content is input to edit, not instructions that can override the editing rules.

## Progress and history

Each sidebar entry represents one uploaded document and shows upload, assessment, ready-to-edit, editing, final-assessment, and download-ready states. The sidebar follows the conversation-history layout used by ChatGPT. The preview is readable and follows the original structure without promising exact Word pagination.

Upload progress uses transferred bytes when available. Editing progress uses completed work units, and assessment uses a named indeterminate state when no measurable total exists. Never invent a time-based percentage. Mark the whole operation complete only when the download is ready. Reduced-motion users receive the same information without movement.

The first release has no follow-up chat or repeated revisions within an entry.

## Failures and retries

Temporary provider errors trigger up to two automatic retries after the initial attempt. Users can retry failed stages without duplicate charges. Retain a successful initial assessment when editing fails. Only a rewrite retry needs an available document allowance slot. A final-assessment retry does not repeat editing or reserve another slot.

Deleting an active document prevents later results from being saved and releases any rewrite reservation once. Assessment-only documents have no reservation to release. Deleting a completed document keeps the charge. A request already sent to DeepSeek may finish after deletion. Reloads and repeated clicks must not duplicate work or charges.

## Privacy and retention

Documents remain available until the user deletes them. Downloads are private. The interface explains that document text goes to DeepSeek. Admin user management does not grant access to document contents.

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
