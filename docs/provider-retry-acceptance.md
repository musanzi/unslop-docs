# Verify automatic provider retries

Run live checks only on the integration stack. Don't start servers, apply live migrations, restart containers, or call DeepSeek from a feature worktree.

## Run deterministic checks

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. To run only the retry tests, use:

```sh
pnpm exec vitest run --config apps/api/vitest.config.mts deepseek-provider document-jobs
```

These tests use the real worker, LangGraph workflow, DOCX validation, and PostgreSQL statements through PGlite. Provider failures are fake. Fixture SQL advances retry eligibility, and stalled requests use fake timers. No retry test needs a real delay or a provider account.

## Prepare an isolated PostgreSQL check

1. Create a disposable database and private document directory. Keep both separate from the running user database and document volume.
2. Apply the migrations. Create a fixture owner and upload a synthetic original with the existing fixture setup. Use `assessmentDocxFixture()` for detection and `readerFixture(textParagraph('word '.repeat(2000)))` for multiple editing chunks.
3. Run only the isolated fixture worker against that database. Construct `DocumentJobs(testDataSource)` and `AssessmentWorker` with the fixture storage, the pinned skill, and `{ processingTimeoutMs: 900000, providerTimeoutMs: 60000 }`.
4. Inject the test provider below into that fixture runner. Don't modify `worker.ts`, add a production provider flag, or bypass Google authentication.

This TypeScript helper wraps `faithfulRevisionProvider()` from `apps/api/src/shared/testing/revision-fixtures.ts`. The runner supplies its dedicated `JobDatabase`, the fixture document ID, and a callback that records only the operation and the call number. The callback can append those two fields to a fixture file across separate process runs.

```ts
import { faithfulRevisionProvider } from './apps/api/src/shared/testing/revision-fixtures';
import { detectionOperation, DocumentProvider } from './apps/api/src/modules/processing/assessment-worker';
import { JobDatabase } from './apps/api/src/modules/processing/document-jobs';

function retryFixtureProvider(
	database: JobDatabase,
	id: string,
	mode: 'fail3' | 'fail2success' | 'permanent',
	target: 'detection' | 'chunks',
	record: (operation: string, call: number) => Promise<void>
): DocumentProvider {
	const faithful = faithfulRevisionProvider();
	const failIfSelected = async (operation: string, selected: boolean) => {
		const rows = await database.query(
			`SELECT ("providerRequests"->$2->>'attempts')::int AS calls
			 FROM document WHERE id = $1`,
			[id, operation]
		);
		const call = (rows[0] as { calls: number }).calls;
		await record(operation, call);
		if (!selected) return;
		if (mode === 'permanent') throw Object.assign(new Error('Fixture rejection'), { status: 401 });
		if (mode === 'fail3' || call < 3)
			throw Object.assign(new Error('Fixture unavailable'), { status: 503 });
	};
	return {
		detect: async (text, signal) => {
			await failIfSelected(detectionOperation, target === 'detection');
			return faithful.detect(text, signal);
		},
		edit: async (system, chunk, signal) => {
			await failIfSelected(`edit:${chunk.id}`, target === 'chunks');
			return faithful.edit(system, chunk, signal);
		}
	};
}
```

## Check retries across process restarts

Detection stops at `assessed`. To start editing in a fixture run, call `UnslopifyDocumentHandler` as `tools/check-allowance-postgres.cjs` does, then call `runOnce()` again.

1. Use a new fixture document for each scenario. Call `runOnce()` with `fail3` targeting detection. Confirm one recorded call, `processing` status, no published result, and a future `nextRequestAt`.
2. Save the document ID, `processingAttemptId`, `processingStartedAt`, and `processingDeadline`. End the fixture process after `runOnce()` returns. Start a new process with the same database, storage, and provider scenario. Confirm that `runOnce()` returns `false` before the due time and makes no provider call.
3. After the persisted due time, run once again. Confirm call two and another future due time. Repeat with a third process after that due time. Confirm exactly three calls, terminal `failed` status, and an unchanged attempt ID, start time, and deadline.
4. Repeat with `fail2success` targeting detection. Confirm three detection calls and `assessed` status. Additional runs must make no calls.
5. Repeat with `fail2success` targeting chunks and the multi-chunk original. Start editing after detection. Confirm one detection call and three calls per chunk, then one completed row and one published revised key. Restart after a later chunk schedules its retry. Earlier successful chunks must not appear again in the call log.
6. Repeat with `permanent`. Confirm one call, terminal failure, no revised download, and an available original.

Inspect only checkpoint metadata when collecting evidence:

```sql
SELECT id, status, "processingAttemptId", "processingStartedAt",
       "processingDeadline", "nextRequestAt", "failureCode"
FROM document WHERE id = '<fixture document UUID>';

SELECT request.key AS operation,
       request.value->>'state' AS state,
       request.value->>'attempts' AS calls,
       request.value->'failure' AS failure
FROM document, jsonb_each("providerRequests") AS request
WHERE id = '<fixture document UUID>';
```

## Check guards and recovery boundaries

1. Schedule a temporary failure with a short processing timeout. Restart after the original deadline. Confirm `failed` with `deadline`, and no further provider call.
2. In the isolated runner, pause the fake provider after it records a call and before it returns. Kill that fixture process. Restart after its 30-second lease expires. Confirm `interrupted` and no repeat of the unknown request. A graceful abort during that request must also fail without a retry.
3. Pause the runner after a successful chunk checkpoint commits and before the next request starts. Kill the process and restart after lease expiry. Confirm that recovery reuses the successful chunk and keeps the original deadline. The automated test named **recovers a committed chunk after a hard stop** exercises this boundary by interrupting database access.
4. Start two isolated worker processes against the same due retry. Confirm one provider call for that retry and one final publication. Confirm that the old claim token cannot renew, write a checkpoint, or publish.
5. Delete a fixture document during a pending request and after a retry is scheduled. Confirm that neither path recreates the row or publishes a revision. Check that the original and revised files are preserved with the existing revision fixtures.

## Check the integrated stack

Don't run two worker versions together. `tools/deploy.sh` stops the worker before it applies migrations.

Keep an explicit `DEEPSEEK_MODEL` and the disabled-thinking option. Sign in with Google and confirm these behaviors:

- Processing stays visible during retries.
- Failure appears only at the terminal transition.
- Original downloads stay available.

Record evidence from the real provider and containers separately from the isolated fake-provider checks.
