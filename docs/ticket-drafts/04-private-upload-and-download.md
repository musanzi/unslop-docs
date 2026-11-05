# 04: Upload a DOCX and download it privately

## What to build

A signed-in user opens the document workspace, uploads a DOCX, sees it as an entry in a conversation-history sidebar, and downloads it. Nobody else can reach the file, including the admin. This ticket creates the private document storage from ADR 0002 and the workspace shell that later tickets fill.

## Acceptance criteria

- [ ] After sign-in, a user reaches the document workspace.
- [ ] The workspace has an upload control and a notice that document text goes to DeepSeek. The notice is visible before the user uploads.
- [ ] A user can upload a DOCX of up to 10 MB. A new entry appears at the top of the sidebar with the file name and upload date.
- [ ] A file over 10 MB is rejected with an explanation, and nothing is stored. A file of exactly 10 MB is accepted.
- [ ] A file that is not a DOCX by content is rejected with an explanation, even if it is named `.docx`.
- [ ] The sidebar follows a conversation-history layout. It lists one entry per uploaded document, newest first, and has an empty state. On a phone it opens as a drawer.
- [ ] The sidebar list is paginated, because documents stay until the user deletes them.
- [ ] Each user sees only their own entries.
- [ ] Documents live in a private persistent volume that is separate from public uploads, in both Compose files. Stored names are generated and never come from the user's file name.
- [ ] No stored document is reachable through the public uploads route or any other static route.
- [ ] The owner can download the document. The response sets a safe download file name and forbids shared caching.
- [ ] A signed-out request gets a 401.
- [ ] A request from another user or from the admin gets the same 404 as a document that does not exist.
- [ ] No admin endpoint, statistic, or CSV export exposes document contents or file names.
- [ ] A document survives an API container restart.
- [ ] Logs never contain document text.
- [ ] The glossary defines Document, and the README documents the new storage setting and the volume.
- [ ] The API contract is regenerated.
- [ ] Specs cover the owner, other-user, admin, and signed-out cases, and the 10 MB boundary.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes screenshots of the empty and populated workspace at desktop and phone widths.

- [ ] The original remains available to its owner after editing, separately labelled from the revised download.

## Blocked by

None (can start immediately).
