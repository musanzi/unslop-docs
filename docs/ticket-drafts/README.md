# Approved implementation tickets

The owner approved this breakdown. All 14 tickets are published to GitHub with the `ready-for-agent` label and native blocking relationships. DOCX editing and output validation are one ticket. The local files retain the approved issue text. GitHub is the issue tracker.

## Tickets

| GitHub issue | Ticket | Blocked by |
| --- | --- | --- |
| [#1](https://github.com/musanzi/unslop-docs/issues/1) | [Sign in with Google only and configure the admin account](01-google-only-sign-in.md) | None |
| [#2](https://github.com/musanzi/unslop-docs/issues/2) | [Present unslop-docs as a student product with an English interface](02-brand-and-english-interface.md) | None |
| [#3](https://github.com/musanzi/unslop-docs/issues/3) | [Let the admin change a user's status and see its history](03-admin-status-changes.md) | None |
| [#4](https://github.com/musanzi/unslop-docs/issues/4) | [Upload a DOCX and download it privately](04-private-upload-and-download.md) | None |
| [#5](https://github.com/musanzi/unslop-docs/issues/5) | [Reject documents the editor cannot process](05-reject-unprocessable-docx.md) | [#4](https://github.com/musanzi/unslop-docs/issues/4) |
| [#6](https://github.com/musanzi/unslop-docs/issues/6) | [Produce a writing assessment in a background worker](06-background-writing-assessment.md) | [#5](https://github.com/musanzi/unslop-docs/issues/5) |
| [#7](https://github.com/musanzi/unslop-docs/issues/7) | [Unslop a document into a validated revised DOCX](07-unslop-to-revised-docx.md) | [#6](https://github.com/musanzi/unslop-docs/issues/6) |
| [#8](https://github.com/musanzi/unslop-docs/issues/8) | [Retry temporary provider errors automatically](08-automatic-provider-retries.md) | [#6](https://github.com/musanzi/unslop-docs/issues/6) |
| [#9](https://github.com/musanzi/unslop-docs/issues/9) | [Enforce the monthly allowance with reservations](09-monthly-allowance-reservations.md) | 03, 07 |
| [#10](https://github.com/musanzi/unslop-docs/issues/10) | [Let users retry a failed document](10-user-retry-failed-documents.md) | 09, 08 |
| [#11](https://github.com/musanzi/unslop-docs/issues/11) | [Delete a stored document](11-delete-stored-document.md) | [#4](https://github.com/musanzi/unslop-docs/issues/4) |
| [#12](https://github.com/musanzi/unslop-docs/issues/12) | [Delete an active document safely](12-delete-active-document.md) | 07, 10, 11 |
| [#13](https://github.com/musanzi/unslop-docs/issues/13) | [Animate upload, editing, and completion states](13-workspace-animations.md) | [#7](https://github.com/musanzi/unslop-docs/issues/7) |
| [#14](https://github.com/musanzi/unslop-docs/issues/14) | [Deploy the product on one server](14-one-server-deployment.md) | [#7](https://github.com/musanzi/unslop-docs/issues/7) |

## Accepted clarifications

A validated upload starts assessment and editing automatically, with one reservation before the first DeepSeek request. Footnotes, endnotes, comments, headers, and footers remain unchanged. Text boxes, content controls, and embedded objects are rejected. Bold, italics, and hyperlink targets are preserved or the result fails validation.

Admin controls retain user listing and status management. The starter's user creation, CSV import, role assignment, and user deletion controls are removed.

## Implementation defaults

Both originals and revised documents remain downloadable. English and French can appear together. Automatic retries apply per provider request, bounded by a persisted processing deadline with a configurable 15-minute default. The server requires an explicit DeepSeek model setting. Local interactive sign-in uses Google OAuth, and automated tests use fake identities without a production bypass.

Only the configured verified Google account has admin access, including after configuration changes. Output checks protect structure and unchanged content but do not prove semantic equivalence. Production documentation covers HTTPS, secure cookies, and reverse-proxy settings without choosing a domain for the owner.

Each ticket includes its own checks and documentation. Configuration work can proceed before all product work is complete, but public launch requires the full first-release checklist.
