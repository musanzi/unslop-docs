# Approved implementation tickets

GitHub is the issue tracker. The original 14-ticket breakdown is retained below. Issues #11–#13 now include the accepted workflow revision, and follow-up issues #15–#16 replace the relevant scope of closed tickets. Deployment issue #14 is closed because the owner confirms the app is live. The local ticket files mirror the current open issue scope; closed ticket files retain their historical requirements.

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
| [#11](https://github.com/musanzi/unslop-docs/issues/11) | [Delete a stored document](11-delete-stored-document.md) | #4, #16 |
| [#12](https://github.com/musanzi/unslop-docs/issues/12) | [Delete an active document safely](12-delete-active-document.md) | #7, #10, #11, #16 |
| [#13](https://github.com/musanzi/unslop-docs/issues/13) | [Show document preview, rewrite strength, and processing progress](13-workspace-animations.md) | #7, #16 |
| [#14](https://github.com/musanzi/unslop-docs/issues/14) | [Deploy the product on one server](14-one-server-deployment.md) | [#7](https://github.com/musanzi/unslop-docs/issues/7) |
| [#15](https://github.com/musanzi/unslop-docs/issues/15) | [Accept common Word documents and tolerate formatting differences](accept-common-word-documents.md) | None |
| [#16](https://github.com/musanzi/unslop-docs/issues/16) | [Assess uploads, wait for Unslopify, and assess the revised result](assess-then-unslopify.md) | #15 |

## Accepted clarifications

A valid upload starts assessment automatically, then waits at a read-only preview with an estimated AI-style score. The user selects rewrite strength and clicks Unslopify. Editing and final assessment run automatically before download. There is no separate assessment action or allowance. Reserve one document slot only when Unslopify starts, and charge it when the revised download is ready.

Ordinary content controls are normalized into visible text or images. Tracked changes use the final version. Match the original formatting as closely as practical, without failing solely on formatting differences. A passage that fails content-preservation checks keeps its original text, with a notice. Safe complex elements remain unchanged where practical. Security, readable-file, 10 MB, 10,000-word, and English/French limits remain.

Admin controls retain user listing and status management. The starter's user creation, CSV import, role assignment, and user deletion controls are removed.

## Implementation defaults

Both originals and revised documents remain downloadable. English and French can appear together. Automatic retries apply per provider request, bounded by a persisted processing deadline with a configurable 15-minute default. Initial assessment and rewriting have separate active deadlines; time at the preview is outside both. Rewriting includes its final assessment. The server requires an explicit DeepSeek model setting. Local interactive sign-in uses Google OAuth, and automated tests use fake identities without a production bypass.

Only the configured verified Google account has admin access, including after configuration changes. Content checks do not prove semantic equivalence. Use the same versioned 0–100 scoring rubric before and after rewriting. Strength ranges from 1 to 100, initially 50, and does not promise a score reduction. A missing final score after bounded retries does not discard a usable revision. Production documentation covers HTTPS, secure cookies, and reverse-proxy settings without choosing a domain for the owner.

Each ticket includes its own checks and documentation. The [product specification](../product-spec.md), [workflow design](../document-workflow-design.md), and ADRs 0004–0005 describe the accepted revision. These documents do not claim the new behavior is already implemented.
