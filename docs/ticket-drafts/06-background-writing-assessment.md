# 06: Produce a writing assessment in a background worker

## What to build

After a user uploads a valid DOCX, a background worker sends its text to DeepSeek and the sidebar entry shows the progress. The user then reads a writing assessment that lists writing patterns with examples from the document. This ticket adds the worker, the DeepSeek integration, and the document's processing states, which every later processing ticket uses.

The patterns come from the Cursor pstack unslop skill at revision `bc697d0a5a163cec979e362b601e36f5616083fd`. The file at that revision has the SHA-256 hash `ccab208e315ce05e2fab8eeee2f7879f1289b5c6844840b2d307adf31c79144f`. The file's directory carries an MIT license, copyright Lauren Tan.

## Acceptance criteria

- [ ] A worker process, separate from the API, processes documents. It runs in the development Compose stack.
- [ ] The upload request returns without waiting for DeepSeek.
- [ ] A queued job survives a restart of the API or the worker.
- [ ] A job interrupted by a worker restart resumes or ends as failed. It does not stay in processing forever.
- [ ] The worker reads `DEEPSEEK_API_KEY` on the server. The key never appears in a response, a log, the web bundle, or the repository.
- [ ] The environment example lists the DeepSeek settings, and the worker refuses to start with a clear message if the key is missing.
- [ ] The repository holds the pinned skill file unchanged, with its source URL, revision, and MIT notice. The application never fetches it at runtime.
- [ ] A spec fails if the stored file no longer matches the pinned hash.
- [ ] The assessment lists patterns, and each pattern has at least one example quoted from the document. An example that does not appear in the document is dropped.
- [ ] A document with no patterns gets an assessment that says so.
- [ ] The assessment shows no percentage, score, or claim about AI authorship. The interface calls it a writing assessment.
- [ ] Document text reaches DeepSeek as data to analyze. A fixture document that contains text such as "ignore your rules" gets a normal assessment.
- [ ] The sidebar entry and the main panel show the processing state and update without a page reload.
- [ ] If DeepSeek fails, the entry shows a failed state with an explanation, and no partial assessment is saved.
- [ ] Only the owner can read an assessment. Other users and the admin get the same 404 as a document that does not exist.
- [ ] Logs never contain document text, assessment examples, or the API key.
- [ ] An ADR records the queue choice if it carries reversal costs, and the glossary defines any new processing term.
- [ ] The README explains how the worker runs. If the running stack needs a restart to pick up the worker, the pull request says so, because the owner runs the stack.
- [ ] The API contract is regenerated.
- [ ] Specs use a fake DeepSeek client and cover success, failure, the injection fixture, and interrupted jobs.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes screenshots of the processing, assessed, and failed states.

- [ ] A valid upload starts assessment and then editing automatically when the editing slice is present. There is no separate user confirmation between the steps. Reserve one allowance slot before the first provider request once allowance enforcement is present.
- [ ] The assessment applies the skill's general prose rules to both supported languages. English vocabulary examples apply to English text, not as a literal blacklist for French.
- [ ] The model is configured through a required server-side `DEEPSEEK_MODEL` setting. Setup instructions explain how to select an available model from official provider documentation.
- [ ] A persisted, configurable processing deadline defaults to 15 minutes from worker processing start. Provider calls have finite timeouts. Recovery marks expired work failed and releases its reservation once allowance enforcement is present. Late responses cannot revive a failed job.

## Blocked by

- 05: Reject documents the editor cannot process
