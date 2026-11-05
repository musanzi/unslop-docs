# 01: Sign in with Google only and configure the admin account

## What to build

A visitor signs in or registers with their Google account, and no password path remains anywhere in the product. The Google account named by `ADMIN_EMAIL` becomes the admin. Google sign-in and Redis sessions already work, so this ticket removes the password paths and adds the admin rule.

Removing the seeded password accounts and adding `ADMIN_EMAIL` belong together. Without both, nobody can reach the admin portal.

## Acceptance criteria

- [ ] The sign-in page offers Google as the only way in. It has no email or password fields.
- [ ] The sign-up, forgot-password, forgot-password-sent, and reset-password screens no longer exist, and no link points to them.
- [ ] The profile screen has no password form.
- [ ] The API no longer offers sign-up, password sign-in, password update, forgot-password, or reset-password. A request to any of these routes returns 404.
- [ ] Admin user creation, CSV import, user deletion, and role-assignment routes and controls are removed. The admin retains user listing and status management. Google sign-in is the only account-creation path.
- [ ] A migration removes stored password hashes, and the seed script contains no passwords.
- [ ] Code and settings that only password flows used are gone, including password hashing, the reset email, and the JWT settings.
- [ ] A first Google sign-in creates a user with the `user` role and starts a Redis session. Admin authorization follows the configured account rather than editable role assignments.
- [ ] Only the Google account with a verified email matching `ADMIN_EMAIL`, ignoring letter case, can use admin endpoints and the admin portal. Changing this setting revokes the previous account's admin access, including existing sessions.
- [ ] Every other account gets a 403 from admin endpoints and cannot open the admin portal.
- [ ] The API refuses to start with a clear message if `ADMIN_EMAIL` is missing.
- [ ] A user who cancels Google consent returns to the sign-in page and sees an explanation.
- [ ] Sign-out ends the session.
- [ ] The README, the environment example, and the regenerated API contract describe Google-only sign-in and `ADMIN_EMAIL`. The README no longer lists seeded password accounts.
- [ ] Specs cover verified Google identity, admin assignment and revocation, and the absence of password and removed admin routes.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.

- [ ] Local interactive sign-in uses real Google OAuth credentials. Automated tests use fake Google identities and isolated sessions, without adding an authentication bypass to the application.
- [ ] Google identities use the stable provider subject, and the OAuth flow validates state.

## Blocked by

None (can start immediately).
