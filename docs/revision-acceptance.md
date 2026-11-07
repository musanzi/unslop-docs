# Verify revised DOCX documents

Run live checks only on the integration stack. Don't start servers, build images, apply live migrations, or call DeepSeek from a feature worktree.

## Run deterministic checks

Run these commands from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
```

The API suite runs the real reader, LangGraph workflow, ZIP construction, output validation, and queue SQL. Fake identities and providers exist only in test code. No environment flag bypasses authentication or replaces the production provider.

The revision corpus includes English and French prose with citations, quotations, dates, numbers, URLs, headings, lists, tables, bold, italics, hyperlinks, images, equations, reference fields, notes, comments, headers, and footers. Tests include faithful edits, mutated provider responses and archives, prompt injection, multiple requests, and a 10,000-word text node. Worker tests cover terminal publication guards and cleanup. HTTP and Angular tests cover private downloads and the completed and failed entries.

To generate original and revised DOCX files without provider calls, run:

```sh
node tools/generate-revision-fixtures.cjs /tmp/unslopy-revision-smoke
```

The script writes `english-original.docx`, `english-revised.docx`, `french-original.docx`, `french-revised.docx`, `injection-original.docx`, `injection-revised.docx`, `maximum-original.docx`, and `maximum-revised.docx`. It uses the production workflow with a test-only faithful provider and the pinned skill. Every revised file passes output validation before the script writes it.

To build an isolated fixture runner, follow these steps:

1. Use `revisionFixture(language)` and `faithfulRevisionProvider()` from `apps/api/src/shared/testing/revision-fixtures.ts`.
2. Construct `AssessmentWorker` with `DocumentJobs(testDataSource)`, private storage that implements `read`, `write`, and `remove`, the fake provider, the pinned skill, and normal timeout settings.
3. Call `runOnce()`.

Use a dedicated test database and volume so that fixture providers cannot claim real user jobs.

## Check the integrated runtime

1. Confirm that the worker's private documents mount is writable. Keep the API and the worker on the same private volume with a compatible filesystem identity.
2. Confirm that the worker has an explicit model setting. Don't expose the key in logs or browser code.
3. Sign in with Google and upload an English original. Confirm that the entry stops at its AI detection rate. Choose a rewrite strength, select **Unslopify**, and confirm that the entry reaches **Completed**. Repeat with a French original.
4. Capture desktop and phone screenshots of a completed entry, its AI detection rate, both separately labeled downloads, and the review reminder. Confirm that the Unslopy dark workspace and Google sign-in stay intact.
5. Download both versions. Compare the original to the uploaded bytes. Confirm that the revised prose contains the expected faithful change and keeps the language, citations, quotations, facts, and document structures.
6. Open each revised English and French DOCX in Microsoft Word and LibreOffice. Check heading levels, paragraph order, list nesting, tables, bold, italics, links, images, equations, fields, notes, comments, headers, and footers. Record the application versions and the results. Exact pagination is not required.
7. Upload the injection original and confirm that the app treats its embedded request as text. Upload the maximum-size fixture and confirm that all editing requests finish within the persisted deadline.
8. In the isolated fixture runner, return an altered citation that crosses two spans, or an incomplete second chunk. Confirm **Failed**, an actionable explanation, no revised download, and an unchanged original. Capture the failed entry.
9. Request both downloads as another user, as an admin, and without a session. Confirm 404 for the first two and 401 without a session. Confirm that guessed private storage paths return 404.
10. Stop the worker during editing and restart it after the lease expires. Confirm failure without late publication. Repeat with a short deadline and a delayed fake provider. Confirm that logs contain only fixed failure codes.

The automated suite does not supply screenshots, evidence of quality with the real provider, or evidence of opening files in Word and LibreOffice. Record those results separately. The [validation limits](document-revisions.md#validation) still apply after these checks.
