# Issue #9 verification

The implementation starts at `49b9e4343bea0f995725de21c3bb7bbbd0ab647d` on `integration/unslop-docs-v1`. The final branch also merges integration commit `de69b7815d4fc6c6a465deac43b12c2c66fbf8a9`, preserving the dashboard redesign. Verification uses synthetic DOCX fixtures and fake providers. No real DeepSeek request, live application migration, or service restart is part of these checks.

## Real PostgreSQL

Run from the implementation checkout:

```sh
bash tools/check-allowance-postgres.sh unslopy-api-1
```

The check ran successfully on 2026-11-05 against the existing Docker PostgreSQL service. All migrations ran in a fresh, randomly named database. The script removed the database and temporary source copy afterward.

Observed results:

- Ten last-slot races each placed two separate upload transactions behind a held user-row lock. Each race accepted one upload, rejected one with HTTP status 409, and saved only one additional file.
- A reservation waiting for the user lock across December/January used the time after lock acquisition.
- A fake provider produced a validated revised DOCX. Completion charged the reservation month, and deleting that document retained its charge without its document reference.
- An unreserved queued document made no provider call.
- The real status-change handler preserved usage across upgrade and downgrade. Reserved work completed after downgrade. Repeated completion and failure did not account twice.
- PostgreSQL rejected a second active reservation for one document through the unique index.

## Service-free specifications

The upload and allowance specs use PGlite with real reservation SQL, upload validation, transaction rollback, and worker transitions. They cover FREE, PREMIUM, and GOLD limits, November/December and December/January boundaries, prior-month completion, deletion, upgrades, downgrades, failure release, recovery, provider retries, invalid revisions, and migration upgrade and rollback behavior.

HTTP specs cover the private allowance route, signed-out rejection, owner isolation, private caching, and upload error responses. Workspace specs cover counts, UTC reset text, the blocked upload control, retained downloads, server rejection messages, and refreshed usage after an upgrade or month rollover.

## Required checks

All checks passed on 2026-11-05 after resolving the integration merge:

- `pnpm generate:api` regenerated the allowance response and HTTP 409 contract.
- `pnpm lint` passed for the API, web, and generated contract.
- `pnpm typecheck` passed, including API and web specs and Angular template checks.
- `pnpm test:api` passed 348 tests in 27 files.
- `pnpm test:web` passed 30 tests in 5 files.
- `git diff --check` passed.

The lint, typecheck, and test commands used `--config.verify-deps-before-run=false` to reuse the prepared dependency installation. This flag disables pnpm's automatic install before scripts; it does not skip any check. No build ran.

## Integration evidence still required

The parent performs integrated browser review and screenshots after merging and deploying the implementation. Capture the allowance display and blocked message at desktop and phone widths. The implementation worktree does not migrate or restart the owner's app stack. This record does not claim those screenshots or live UI verification.
