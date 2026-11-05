# Issue #10 verification

The implementation started at `0614288f7a8397d1dcd85bf444e0441e37ebcafc`. The prepared checkout contained the integration tip before editing. During implementation, `main` became the integration branch. The implementation branch merged `dd575451af267f186cb5d5305ff4469549f8ff38`, including the public health endpoint and deployment changes.

## Retry behavior

`POST /documents/:id/retry` checks ownership and failed status under a document row lock. It reserves allowance and resets the document to queued in one transaction. The stored original and history entry remain unchanged. The next worker claim starts a fresh processing attempt. The workspace exposes **Retry** on failed sidebar entries, prevents double-click submissions, and refreshes progress and allowance after the response.

The implementation adds no migration. It uses the existing PostgreSQL queue, provider checkpoints, and allowance reservations.

## Automated specifications

The approved test boundaries were the retry API, processing workflow, and workspace UI. The initial tests failed before implementation for queueing, the HTTP route, attempt reset, retry visibility, double-click handling, and refusal messages. Subsequent regression cases exercised the resulting behavior.

HTTP tests cover signed-out rejection, owner access, the same 404 for other users and admins, invalid identifiers, private caching, and refusal of every non-failed status.

The workflow tests use PGlite with real reservation and job SQL, a controlled allowance clock, synthetic DOCX files, and fake providers. They cover:

- Reusing the original without adding a second file or history entry.
- Clearing prior attempt metadata and rejecting late results from an old claim.
- Two failed attempts with three provider calls each, followed by success on the third call of a fresh attempt.
- Exactly one charge after those failures, assigned to February when the original failed in January.
- Allowance refusal that leaves the document failed and sends no provider request.
- One reservation and one job for competing retries.
- No reservation for a different owner, and rollback when queueing fails.

Workspace tests render the real store and component with HTTP transport fixtures. They cover failed-only visibility, double clicks, pending controls, queued progress, refreshed allowance, server refusal messages, uncertain responses, and an older detail response arriving after retry.

## PostgreSQL concurrency

Run the isolated check against an existing API container:

```sh
bash tools/check-allowance-postgres.sh unslopy-api-1
```

The check passed on 2026-11-05. Ten retry races each held two connections at PostgreSQL locks before releasing them. Every race accepted one retry, rejected the other with HTTP status 409, created one reservation and one claimable job, and retained the same original. Failing the new attempt released its reservation without a charge.

A retry blocked on the owner lock from January into February reserved February after the lock was released. Fake-provider completion charged February and left January with no charge. The existing upload race, publication, status-change, deletion, and reservation-uniqueness checks also passed.

The script applied all migrations in a randomly named database and removed that database and its temporary source copy afterward. It did not change live application records or send a live provider request.

## Required checks

Checks ran on 2026-11-05 with the prepared dependency installation and pnpm 12.11.2. Commands used `--config.verify-deps-before-run=false`, as documented for issue #9. No build or application server started.

- `pnpm generate:api` regenerated the retry endpoint and response contract.
- `pnpm lint` passed.
- `pnpm typecheck` passed, including API and web specs and Angular templates.
- `pnpm test:api` passed 357 tests in 28 files.
- `pnpm test:web` passed 40 tests in 5 files.
- `git diff --check` passed.

The initial typecheck found nullable DOM lookups in the new workspace tests. The tests now fail explicitly when a required element is absent, and the subsequent typecheck passed.

## Integrated workspace verification

The implementation was fast-forwarded into `main` on 2026-11-05. The existing development stack served the updated workspace. No application server was started or restarted.

A temporary synthetic account and failed document exercised the real API reads and workspace. The failed sidebar entry displayed **Retry** at 1440 × 1000 and 390 × 844. Neither viewport had horizontal overflow. The phone screenshot shows the open document drawer.

- [Failed entry on desktop](failed-desktop.png)
- [Failed entry on phone](failed-mobile.png)

The temporary account, session, document, private file, and accounting records were removed after capture. Both browser sessions were closed. No live processing request or DeepSeek call was made.

The preview tool saved neither screenshot because both attempts timed out. A headless Chromium session captured the same local workspace. An earlier document-selection click was rejected by automatic approval review as a potential processing action. The captures used the already-visible failed entry without triggering **Retry**. Automated specifications and the isolated PostgreSQL check provide retry execution evidence.

## Standards

The independent standards review covered `dd575451af267f186cb5d5305ff4469549f8ff38...d721488b531c4e37e9431952ae346cf6b88d70fb`. It found three minor writing issues and repeated worker setup in the tests. The follow-up replaces slash notation and a semicolon in prose, formats the **Retry** label, and shares worker setup across the affected tests. The API contract was regenerated after the description change. No material architecture or Angular violation was found.

## Spec

The independent spec review found no missing requirements, scope creep, or incorrect implementation. It checked locking, reservation timing, stale worker fencing, owner isolation, retry budgets, charge accounting, UI races, and test coverage. The screenshots above complete the visual evidence.
