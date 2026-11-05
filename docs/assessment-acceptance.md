# Verify background writing assessments

Run these checks after integrating issue #6. The implementation worktree does not start servers, build images, apply live migrations, or mutate the parent's stack.

## Run deterministic smoke tests

Run the API suite from the repository root:

```sh
pnpm test:api
```

To run only the assessment and queue tests:

```sh
pnpm exec vitest run --config apps/api/vitest.config.mts assessment-workflow deepseek-provider document-jobs
```

These tests run the real DOCX reader, LangGraph nodes, validation, and queue SQL with fake provider responses and embedded PostgreSQL. They cover known and unknown examples, no patterns, malformed output, provider failure, finite waits, late responses, interrupted claims, shutdown, duplicate claims, and deletion during a request. The HTTP suite checks private reads and atomic upload publication without a provider dependency.

Use the synthetic [injection DOCX](../apps/api/src/shared/testing/fixtures/assessment/injection.docx) for upload checks. Regenerate it with:

```sh
node tools/generate-assessment-fixture.cjs
```

`apps/api/src/shared/testing/assessment-fixtures.ts` exports `assessmentDocxFixture()` and `fakeAssessmentProvider(outcome, delayMs)`. Outcomes are `patterns`, `none`, and `failure`. A delay of 5000 ms makes the processing state visible. The `patterns` response includes an invented example that validation must drop. These helpers are test-only imports, with no environment switch in the deployed worker.

For a parent's isolated integration fixture runner, construct `AssessmentWorker` with `DocumentJobs(testDataSource)`, the fixture storage, `fakeAssessmentProvider('patterns', 5000)`, `await loadAssessmentSkill()`, and `{ processingTimeoutMs: 900000, providerTimeoutMs: 60000 }`. Call `runOnce()` to process one queued fixture. Use a dedicated test database and storage so the fake provider cannot claim a real user's queued document. The same worker, queue SQL, reader, and graph run in production. Authentication remains unchanged.

## Collect live evidence

1. Rebuild the changed containers and apply the migration through the parent's authorized deployment procedure. Confirm the worker starts separately and that the API still invokes Nest directly.
2. Sign in through Google or the parent's isolated test-session setup. Upload the injection fixture and confirm that upload returns while the provider is pending.
3. Capture desktop and phone screenshots with a queued or processing sidebar entry and its matching main panel.
4. Complete the fake-provider fixture. Confirm that the panel says **Writing assessment**, shows **Filler phrases** with **In order to**, and omits the invented quote. Capture the assessed state.
5. Run the `none` fixture and confirm **No writing patterns found**. Run the `failure` fixture and capture the failed state with its explanation and no partial assessment.
6. Read the assessment as another user and as the admin. Confirm the same 404 body as a missing document.
7. Queue a document while the worker is stopped, restart the API and worker, and confirm that the job remains available. Stop the worker during assessment, restart it, and confirm that the expired lease becomes failed rather than remaining in processing.
8. Use a short configured deadline with a delayed fake provider. Confirm failure and no later publication. Run two workers against the isolated fixture database and confirm that only one claims each upload.
9. Confirm the original still downloads byte-for-byte after assessment and failure. Check logs for fixed lifecycle messages without document text, examples, or credentials.

The implementation's checks do not replace live migration, container restart, worker concurrency, browser polling, screenshots, or a real DeepSeek compatibility smoke test. The parent owns that evidence. No real provider call is made by the automated suite.
