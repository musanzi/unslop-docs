# 09: Enforce the monthly allowance with reservations

## What to build

A user can start processing only while their monthly allowance has room. Starting processing reserves one slot. Success charges the document to the month of its reservation, as ADR 0001 requires. Failure releases the slot. The workspace shows the user how much of the allowance remains.

## Acceptance criteria

- [ ] FREE allows 3 documents per month, PREMIUM allows 15, and GOLD allows 35.
- [ ] The workspace shows documents used, active reservations, and the remaining allowance for the current UTC month.
- [ ] A new job is blocked when successful documents charged to the current month plus active reservations made in the current month reach the allowance. The message explains the limit and when it resets, and nothing goes to DeepSeek.
- [ ] Two concurrent requests for the last slot produce exactly one reservation. A repeatable check proves this against PostgreSQL, because the unit suite runs without services.
- [ ] No job can be processed without an active reservation, and a document holds at most one active reservation.
- [ ] A reservation created at 23:59:59.999 UTC on the last day of a month belongs to that month. A reservation created at 00:00:00.000 UTC on the first day belongs to the new month. Specs with a controlled clock cover this, including December to January.
- [ ] A document reserved in one month and completed in the next is charged to the reservation month. It does not use the new month's allowance and needs no second reservation.
- [ ] An active reservation from the previous month does not count against the new month.
- [ ] Usage for the new month starts at zero at 00:00 UTC on the first day, without a scheduled reset.
- [ ] A successful document turns its reservation into one charge. Repeated completion handling never charges twice.
- [ ] A failed document releases its reservation once, and the slot is available at once.
- [ ] A status change applies to the next reservation immediately and does not reset usage.
- [ ] After a downgrade, jobs already reserved finish and are charged normally, and new jobs are blocked while usage meets or exceeds the new allowance.
- [ ] After an upgrade, a blocked user can start a job without waiting for the next month.
- [ ] Deleting a completed document does not restore usage. Charges persist without the file, the file name, or any document text.
- [ ] The API contract is regenerated, and the README documents the allowance rules.
- [ ] Specs cover each case above and include the side effects that must not happen, such as a blocked job reaching the worker.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes screenshots of the allowance display and the blocked message.

- [ ] Reserve the slot after successful upload validation and before the first assessment request. Assessment alone is not completion. Convert the reservation to a charge only after a validated revised DOCX is ready.

## Blocked by

- 03: Let the admin change a user's status and see its history
- 07: Unslop a document into a validated revised DOCX
