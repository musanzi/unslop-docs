# 11: Delete a stored document

## What to build

A user deletes a document that is not processing, and everything stored for it goes away. Documents otherwise remain until the user deletes them, so this is the user's control over their own data. Ticket 12 extends deletion to active documents.

## Acceptance criteria

- [ ] Each entry has a delete action with a confirmation that names the document and says that deletion cannot be undone.
- [ ] Deletion covers documents waiting at the assessed preview, failed documents, and completed documents. It removes the entry, original, any normalized or preview artifacts, revised DOCX, both assessments, notices, and private checkpoints.
- [ ] After deletion, a download or read of that document returns 404.
- [ ] Deletion leaves usage records unchanged, so deleting a completed document never restores allowance.
- [ ] An assessed preview has no rewrite reservation or charge. Deleting it changes no document allowance and creates no assessment credit or debit.
- [ ] Repeating a delete request is safe and returns the same result.
- [ ] If removing a file fails, the user sees an error and can repeat the deletion. No stored file is left behind without a record that points to it.
- [ ] Only the owner can delete. Other users and the admin get the same 404 as a document that does not exist, and the document stays intact.
- [ ] Until ticket 12 lands, the API refuses to delete queued or active initial assessment, editing, or final assessment, with an explanation. An idle assessed preview remains deletable.
- [ ] Keyboard focus moves to a sensible place after deletion, and the sidebar shows its empty state after the last entry goes.
- [ ] The API contract is regenerated.
- [ ] Specs cover the removal of each stored item, the other-user and admin cases, and the file removal failure.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes a screenshot of the confirmation.

## Blocked by

- 04: Upload a DOCX and download it privately
- #16: Assess uploads, wait for Unslopify, and assess the revised result.
