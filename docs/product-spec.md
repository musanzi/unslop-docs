# Unslop-docs product specification

This document records accepted product decisions. The application is still a starter. These requirements do not describe completed features.

## Accounts and allowances

Users sign in with Google only. The admin manually assigns FREE, PREMIUM, or GOLD status.

New users start with FREE status. The `ADMIN_EMAIL` setting identifies the admin's Google account. Each status change records the admin, the date, and the previous and new statuses. The first release has no payment integration.

Admin controls retain user listing and status management. The starter's account-creation, CSV-import, role-assignment, and user-deletion controls are removed. Google sign-in is the only account-creation path.

| Status | Documents per month |
| --- | --- |
| FREE | 3 |
| PREMIUM | 15 |
| GOLD | 35 |

Usage resets on the first day of each month at 00:00 UTC. A processing document reserves one slot. Successful documents count toward usage, and failed jobs release their reservations. Status changes apply immediately without resetting usage.

A successful document uses the allowance for the month when its slot was reserved, even if processing finishes the next month. Existing jobs can finish after a status downgrade. New jobs are blocked when completed documents and active reservations exhaust the current allowance. Deleting a completed document does not restore usage.

## Documents

The first release accepts DOCX files and returns DOCX files. Each upload is limited to 10 MB and 10,000 words. Documents can be in English or French. The interface is in English.

Editing preserves meaning, language, citations, quotations, and factual claims. The output preserves headings, paragraphs, lists, and tables. Editing must not invent evidence or references. PDF input, scanned documents, and exact page-layout preservation are outside the first release.

Images, equations, and reference fields remain unchanged. Documents with tracked changes or unsupported structures are rejected before assessment and editing. The rejection explains what the user needs to change.

Footnotes, endnotes, comments, headers, and footers remain unchanged. Text boxes, content controls, and embedded objects are unsupported for launch. Bold, italics, and hyperlink targets survive editing. Output that cannot preserve them fails validation.

## Assessment and editing

Before editing, the system reports writing patterns with examples. The report is a writing assessment, not a verified percentage of AI authorship. Users can edit documents regardless of the assessment result.

A validated upload starts assessment and editing automatically. One allowance slot is reserved before the first DeepSeek request. The user does not need to confirm editing after the assessment.

The system uses DeepSeek with a server-side `DEEPSEEK_API_KEY`. Editing instructions come from the [Cursor pstack unslop skill](https://github.com/cursor/plugins/blob/bc697d0a5a163cec979e362b601e36f5616083fd/pstack/skills/unslop/SKILL.md), as selected by the owner. The selected source revision is `bc697d0a5a163cec979e362b601e36f5616083fd`.

Document content is input to edit, not instructions that can override the editing rules.

## Progress and history

Each sidebar entry represents one uploaded document and shows its progress, result, and download. The sidebar follows the conversation-history layout used by ChatGPT. The interface animates upload, editing, and completion states.

The first release has no follow-up chat or repeated revisions within an entry.

## Failures and retries

Temporary provider errors trigger up to two automatic retries after the initial attempt. Users can retry failed jobs without duplicate charges. Each retry needs an available allowance slot, and only successful processing counts toward usage.

Deleting an active document prevents its result from being saved and releases its reservation. A request already sent to DeepSeek may finish after deletion.

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

The owner approved the implementation ticket breakdown and its clarifications. The [ticket index](ticket-drafts/README.md) records the slices, dependencies, and implementation defaults. The 14 implementation tickets are published to GitHub with native blocking relationships. Application implementation has not started.
