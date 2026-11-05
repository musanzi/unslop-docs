# Document workflow verification

Verified on November 6, 2026, on local `main`, after implementing issues #15, #16, #11, #12, and #13 and addressing the Standards and Spec reviews of `675bd94..188530e`.

## Results

| Check                                                  | Result                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `pnpm lint`                                            | Passed for API, web, and contracts.                                       |
| `pnpm typecheck`                                       | Passed, including API specs, web specs, Angular templates, and contracts. |
| `pnpm test:api`                                        | 431 tests passed in 31 files.                                             |
| `pnpm test:web`                                        | 93 tests passed in 7 files.                                               |
| `bash tools/check-allowance-postgres.sh unslopy-api-1` | Passed against a disposable database in the existing development stack.   |
| `git diff --check`                                     | Passed.                                                                   |

The PostgreSQL check runs real migrations and transactions with synthetic documents and a fake provider. Ten last-slot races each accepted exactly one Unslopify request. Ten retry races each produced one job and one reservation. Ten deletion/publication races exercised five deletion-first outcomes with released reservations and five completion-first outcomes with retained charges. Each race left no document row or stored file behind. The check also covered reservation-month boundaries, status changes, unreserved rewrite refusal, uniqueness, and idempotent accounting. Its temporary database was removed after the run.

## Review fixes

Uploads remain available after the rewrite allowance is exhausted. Only Unslopify is disabled, with the allowance explanation beside it. Regression tests cover both the file input and action button.

Upload byte progress remains visible and accessible through the progress bar, while its live announcement stays constant. Completed documents show before and after scores without a separate score-change label. Legacy documents report that scores were not recorded, rather than claiming a final assessment failed. New failed final assessments still leave the revised download available.

The cleanup removes unused helpers and comments, follows the migration parameter convention, and shares the original-download control, frontend strength default, signal-input test setup, and repeated document test schema. Phase-specific presentation remains in the workspace; provider instruction wording remains in the API.

The database verification script now isolates queued work between scenarios, supplies the status handler's required admin configuration, and gates the final publication call to exercise both race outcomes. Failed checks print stack locations without exception messages, SQL, credentials, or document contents.

## Limits

The provider calls in these checks are deterministic test doubles. No new paid-provider run or browser recording was performed during this review pass. Web interaction tests run under JSDOM, so they do not establish visual layout or real assistive-technology behavior. The preview represents protected images with placeholders; the downloaded DOCX retains supported original elements.

These results describe local main. They do not establish that the production deployment includes these commits. DOCX examples for common controls, tracked changes, and content fallback are in [issue #15 evidence](../issue-15/README.md).
