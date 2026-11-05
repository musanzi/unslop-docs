# 12: Delete an active document safely

## What to build

A user deletes a document during initial assessment, rewriting, or final assessment. No later result is saved. Release a rewrite reservation if one exists; initial assessment holds none. A request already sent to DeepSeek may still finish, and the system discards the answer. When deletion and completion happen at the same moment, the system ends in exactly one valid state.

## Acceptance criteria

- [ ] A user can delete during queued or active initial assessment, rewriting, and final assessment, including automatic-retry waits in each stage.
- [ ] The confirmation explains that text already sent to DeepSeek may still be processed there, and that the result will be discarded.
- [ ] After deletion, the entry and its original, previews, intermediate revisions, assessments, and checkpoints are removed. Release an existing rewrite reservation once and refresh the allowance. Deleting initial assessment changes no document allowance and creates no assessment credit.
- [ ] No result is saved after deletion. A DeepSeek response that arrives later is discarded.
- [ ] After deletion, the worker sends no further DeepSeek requests for that document, including automatic retries and requests for remaining parts of the document.
- [ ] If deletion commits before revision publication, no result exists, any rewrite reservation is released, and nothing is charged. Initial assessment publication alone is never chargeable completion.
- [ ] If completion commits before deletion, the document counts as a completed document. The charge stays and its files are removed.
- [ ] No ordering of the two produces both a charge and a release, a kept reservation with no document, or a stored file with no record.
- [ ] Deletion during a user retry releases any rewrite reservation once and leaves no running job. Initial-assessment retries have no rewrite reservation to release.
- [ ] Deletion racing Unslopify, initial-assessment publication, final-assessment completion, or publication with an unavailable final score cannot recreate a deleted document or leave files or reservations behind.
- [ ] A job recovered after a worker restart does nothing if its document was deleted.
- [ ] Repeated delete requests release the reservation once.
- [ ] Specs use a controllable fake provider to run each ordering above deterministically. A repeatable check runs deletion and completion concurrently against PostgreSQL.
- [ ] The README documents what happens to text already sent to DeepSeek.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes a screenshot of the confirmation for an active document.

## Blocked by

- 07: Unslop a document into a revised DOCX
- 10: Let users retry a failed document
- 11: Delete a stored document
- #16: Assess uploads, wait for Unslopify, and assess the revised result.
