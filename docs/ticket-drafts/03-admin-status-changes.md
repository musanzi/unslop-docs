# 03: Let the admin change a user's status and see its history

## What to build

Every user has a FREE, PREMIUM, or GOLD status, and new users start with FREE. The admin changes a status from the user management screen. Each status change leaves a record of the admin, the date, and the previous and new statuses, and the admin can read that history. No payment integration exists in the first release.

## Acceptance criteria

- [ ] New users start with FREE through Google sign-in. Status management does not introduce another account-creation path.
- [ ] A migration gives every existing user FREE.
- [ ] The admin users list shows each user's status.
- [ ] The admin can change a user's status to FREE, PREMIUM, or GOLD from the users screen. The list shows the new status without a full page reload.
- [ ] Each status change writes one record with the admin, the date, the previous status, and the new status. The status and its record commit together, so neither exists without the other.
- [ ] Submitting the user's current status writes no record.
- [ ] The admin can read a user's status changes, newest first.
- [ ] Non-admin users get a 403 from the status-change and history endpoints.
- [ ] A user cannot change a status through the profile update or any other non-admin route.
- [ ] Signing in again does not change a user's status.
- [ ] A signed-in user's profile response includes their status.
- [ ] The API contract is regenerated.
- [ ] Specs cover the record contents, the no-op case, the rollback when the record cannot be saved, and the 403 cases.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes a screenshot of the status control and the history.

## Blocked by

None (can start immediately).
