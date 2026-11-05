# Verify revised DOCX documents

Use this guide after integrating #7. Run live checks only through the parent's authorized stack. The implementation worktree does not start servers, build images, apply live migrations, or call DeepSeek.

## Run deterministic checks

Run these commands from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
```

The API suite runs the real reader, LangGraph workflow, ZIP construction, output validation, and queue SQL. Fake identities and providers exist only in test code. No environment flag bypasses authentication or replaces the production provider.

The revision corpus includes English and French prose with citations, quotations, dates, numbers, URLs, headings, lists, tables, bold, italics, hyperlinks, images, equations, reference fields, notes, comments, headers, and footers. Tests include faithful edits, mutated provider responses and archives, prompt injection, multiple requests, and a 10,000-word text node. Worker tests cover terminal publication guards and cleanup. HTTP and Angular tests cover private downloads and completed/failed entries.

Generate concrete original and revised DOCX files without provider calls:

```sh
node tools/generate-revision-fixtures.cjs /tmp/unslopy-revision-smoke
```

The script writes `english-original.docx`, `english-revised.docx`, `french-original.docx`, `french-revised.docx`, `injection-original.docx`, `injection-revised.docx`, `maximum-original.docx`, and `maximum-revised.docx`. It uses the production workflow with a test-only faithful provider and the pinned skill. Every revised file passes output validation before the script writes it.

For an isolated parent fixture runner, use `revisionFixture(language)` and `faithfulRevisionProvider()` from `apps/api/src/shared/testing/revision-fixtures.ts`. Construct `AssessmentWorker` with `DocumentJobs(testDataSource)`, private storage implementing `read`, `write`, and `remove`, the fake provider, the pinned skill, and normal timeout settings. Call `runOnce()`. Use a dedicated test database and volume so fixture providers cannot claim real user jobs.

## Check the integrated runtime

1. Apply migration `1793880400000-DocumentRevision` through the authorized deployment procedure. Update the worker container so its private documents mount is writable. Keep the API and worker on the same private volume and compatible filesystem identity.
2. Confirm the worker retains an explicit model setting. For the parent's current smoke test, keep `deepseek-flash`. Do not expose the key in logs or browser code.
3. Upload an English original through Google sign-in. Confirm the entry advances through processing to **Completed** without an editing confirmation. Repeat with a French original and a no-pattern assessment fixture.
4. Capture desktop and phone screenshots of a completed entry, its assessment, both separately labelled downloads, and the review reminder. Confirm the Unslopy dark workspace and Google sign-in remain intact.
5. Download both versions. Compare the original to the uploaded bytes. Confirm the revised prose contains the expected faithful change and retains the language, citations, quotations, facts, and document structures.
6. Open each revised English and French DOCX in Microsoft Word and LibreOffice. Check heading levels, paragraph order, list nesting, tables, bold, italics, links, images, equations, fields, notes, comments, headers, and footers. Record application versions and results. Exact pagination is not required.
7. Upload the injection original and confirm its embedded request is treated as text. Upload the maximum-size fixture and confirm all editing requests complete within the persisted deadline.
8. In the isolated fixture runner, return an altered citation or an incomplete second chunk. Confirm **Failed**, an actionable explanation, no revised download, and an unchanged original. Capture the failed entry.
9. Request both downloads as another user, an admin, and without a session. Confirm 404 for the first two and 401 without a session. Confirm guessed private storage paths return 404.
10. Stop the worker during editing, restart it after the lease expires, and confirm failure without late publication. Repeat with a short deadline and a delayed fake provider. Confirm logs contain only fixed failure codes.

The implementation suite does not supply screenshots, actual-provider quality evidence, or Word/LibreOffice opening evidence. The parent records those results. [Validation limits](document-revisions.md#validation) still apply after these smoke checks.
