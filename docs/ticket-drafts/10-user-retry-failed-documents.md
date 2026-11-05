# 10: Let users retry a failed document

## What to build

A user retries a failed document from its sidebar entry without uploading it again. A retry needs an available allowance slot, and only successful processing counts toward usage, so a document can fail and be retried many times and still cost at most one charge.

## Acceptance criteria

- [ ] A failed entry shows a retry action. Completed and processing entries do not.
- [ ] A retry reuses the stored upload, and the automatic retry limit applies afresh.
- [ ] A retry creates a new reservation in the month of the retry. A document that failed in January and is retried and completed in February is charged to February.
- [ ] If no slot is available, the retry is refused with the allowance message, the document stays failed, and nothing goes to DeepSeek.
- [ ] A double click or two concurrent retries start one job and create one reservation.
- [ ] A retry that fails releases its reservation and charges nothing.
- [ ] A document that fails twice and then succeeds has exactly one charge.
- [ ] The API refuses a retry for a document that is not failed.
- [ ] Other users and the admin get the same 404 as a document that does not exist.
- [ ] The API contract is regenerated.
- [ ] Specs cover each case above, including the month rule with a controlled clock.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes a screenshot of a failed entry with the retry action.

## Blocked by

- 09: Enforce the monthly allowance with reservations
- 08: Retry temporary provider errors automatically
