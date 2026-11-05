# Verify automatic provider retries

Run live checks from the parent's authorized integration checkout. This implementation worktree does not start servers, apply live migrations, restart containers, or call DeepSeek.

## Run deterministic checks

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. To isolate the retry tests, run:

```sh
pnpm exec vitest run --config apps/api/vitest.config.mts deepseek-provider document-jobs
```

These tests use the real worker, LangGraph workflow, DOCX validation, and PostgreSQL statements through PGlite. Provider failures are fake. Retry eligibility advances through fixture SQL, and stalled requests use fake timers. No retry test needs a real delay or provider account.

## Prepare an isolated PostgreSQL check

1. Create a disposable database and private document directory through the parent's deployment procedure. Keep both separate from the running user database and document volume.
2. Apply the migrations through `ProviderRetries1793880500000`. Create a fixture owner and upload a synthetic original using the existing fixture setup. Use `assessmentDocxFixture()` for assessment and `readerFixture(textParagraph('word '.repeat(2000)))` for multiple editing chunks.
3. Run only the isolated fixture worker against that database. Construct `DocumentJobs(testDataSource)` and `AssessmentWorker` with the fixture storage, pinned skill, and `{ processingTimeoutMs: 900000, providerTimeoutMs: 60000 }`.
4. Inject the test provider below into that fixture runner. Do not modify `worker.ts`, add a production provider flag, or bypass Google authentication.

This TypeScript helper wraps `faithfulRevisionProvider()` from `apps/api/src/shared/testing/revision-fixtures.ts`. The runner supplies its dedicated `JobDatabase`, fixture document ID, and a callback that records only the operation and call number. The callback can append those two fields to a fixture file across separate process runs.

```ts
import { faithfulRevisionProvider } from './apps/api/src/shared/testing/revision-fixtures';
import { DocumentProvider } from './apps/api/src/modules/documents/document-workflow';
import { JobDatabase } from './apps/api/src/modules/processing/document-jobs';

function retryFixtureProvider(
	database: JobDatabase,
	id: string,
	mode: 'fail3' | 'fail2success' | 'permanent',
	target: 'assessment' | 'chunks',
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
		assess: async (system, text, signal) => {
			await failIfSelected('assess:v1', target === 'assessment');
			return faithful.assess(system, text, signal);
		},
		edit: async (system, chunk, signal) => {
			await failIfSelected(`edit:${chunk.id}`, target === 'chunks');
			return faithful.edit(system, chunk, signal);
		}
	};
}
```

## Check retries across process restarts

1. Use a new fixture document for each scenario. Call `runOnce()` with `fail3` targeting assessment. Confirm one recorded call, `processing` status, no published assessment or revision, and a future `nextRequestAt`.
2. Save the document ID, `processingAttemptId`, `processingStartedAt`, and `processingDeadline`. End the fixture process after `runOnce()` returns. Start a new process with the same database, storage, and provider scenario. Before the due time, `runOnce()` must return `false` without a provider call.
3. After the persisted due time, run once again. Confirm call two and another future due time. Repeat with a third process after that due time. Confirm exactly three calls, terminal `failed` status, and an unchanged attempt ID, start time, and deadline.
4. Repeat with `fail2success` targeting assessment. Confirm three assessment calls, then normal editing, one completed row, and one published revised key. Additional runs must make no calls.
5. Repeat with `fail2success` targeting chunks and the multi-chunk original. Confirm one assessment call and three calls per chunk. Restart after a later chunk schedules its retry. Earlier successful chunks must not appear again in the call log.
6. Repeat with `permanent`. Confirm one call, terminal failure, no revised download, and the original still available.

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
2. In the isolated runner, pause the fake provider after recording a call but before returning. Kill that fixture process. Restart after its 30-second lease expires. Confirm `interrupted` and no repeat of the unknown request. A graceful abort during that request must also fail without retrying.
3. Pause the runner after a successful chunk checkpoint commits and before the next request starts. Kill the process and restart after lease expiry. Confirm recovery reuses the successful chunk and retains the original deadline. The automated test named **recovers a committed chunk after a hard stop** exercises this boundary by interrupting database access.
4. Start two isolated worker processes against the same due retry. Confirm one provider call for that retry and one final publication. Confirm the old claim token cannot renew, write a checkpoint, or publish.
5. Delete a fixture document during a pending request and after a retry is scheduled. Confirm neither path recreates the row or publishes a revision. Check original and revised preservation with the existing revision fixtures.
6. Roll the retry migration down and up in the disposable database with a scheduled retry present. Confirm rollback fails that active attempt and does not requeue it or change original files. Confirm completed documents retain their revised metadata.

## Update the integrated stack

Stop old workers before applying the migration and deploying the updated worker. Old recovery code treats released retry leases as failures, so do not mix worker versions. The parent owns these deployment steps and the final browser smoke check.

Keep the real model setting `deepseek-flash` and the deliberate disabled-thinking option. Sign in through Google and verify that processing remains visible during retries, failure appears only at the terminal transition, and original downloads remain available. UI, authentication, and branding are unchanged by this issue. Record actual-provider and container evidence separately from the isolated fake-provider checks.
