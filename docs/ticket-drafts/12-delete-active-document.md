# 12: Delete an active document safely

## What to build

A user deletes a document while it is processing. Its result is never saved and its reservation is released. A request already sent to DeepSeek may still finish, and the system discards the answer. When deletion and completion happen at the same moment, the system ends in exactly one valid state.

## Acceptance criteria

- [ ] A user can delete a document while it is queued, while a DeepSeek request is in progress, and while it waits for an automatic retry.
- [ ] The confirmation explains that text already sent to DeepSeek may still be processed there, and that the result will be discarded.
- [ ] After deletion, the entry is gone, the reservation is released, and the allowance display shows the free slot.
- [ ] No result is saved after deletion. A DeepSeek response that arrives later is discarded.
- [ ] After deletion, the worker sends no further DeepSeek requests for that document, including automatic retries and requests for remaining parts of the document.
- [ ] If deletion commits before completion, no result exists, the reservation is released, and nothing is charged.
- [ ] If completion commits before deletion, the document counts as a completed document. The charge stays and its files are removed.
- [ ] No ordering of the two produces both a charge and a release, a kept reservation with no document, or a stored file with no record.
- [ ] Deletion during a user retry leaves one released reservation and no running job.
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
