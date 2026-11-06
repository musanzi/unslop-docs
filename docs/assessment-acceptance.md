# Verify writing assessment and rewriting

Use the existing Docker development stack with the [DOCX renderer](../services/renderer/README.md) healthy and the worker running. Configure the DeepSeek model and API key. Both assessment and rewriting call DeepSeek.

Run the automated checks:

```sh
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
python3 -m unittest discover -s services/renderer -v
```

Use synthetic documents for these flow checks:

1. Upload an English DOCX of five rendered pages or fewer. Confirm that assessment finishes before editing starts and no allowance slot is reserved.
2. Confirm that the result is labeled **AI-style score** and shows a number out of 100. The score describes writing patterns and does not establish authorship.
3. Choose a rewrite strength and select **Unslopify**. Confirm that DeepSeek edits with the pinned unslop rules, a validated DOCX is saved, and the revised prose is assessed.
4. Confirm that the original remains unchanged and both downloads are available. A final score that rises does not block the download, nor does a rewrite that expands beyond five pages.
5. Repeat with French prose and enough sentences to require multiple assessment batches. Confirm that every eligible sentence contributes to coverage, including clean sentences.
6. Upload a short document containing only quotations. Confirm an unavailable score instead of zero, with editing still available. Ordinary short prose can receive a score.
7. Reject a six-page upload before a document record or private file is saved. Cover pages, references, and blank pages count. Saved page metadata does not override rendering.
8. Confirm that an unavailable renderer prevents upload acceptance with a retry message. A provider failure uses the durable retry policy. An exhausted final assessment preserves the revised download.
9. Delete a queued or processing document. Confirm that no late result is accepted, any active rewrite reservation is released, and its private files are removed.
10. After migration, confirm that old detector results are absent while documents, downloads, accounts, and usage remain. Rewriting an older assessed document obtains a new initial assessment first.

The [renderer smoke check](../services/renderer/README.md) verifies real page counts. Deployment also runs `tools/smoke-document-workflow.cjs` inside the API and worker images to verify five-page acceptance, six-page rejection, and a synthetic assessment/rewrite/final-assessment cycle. These checks validate the integration and preservation checks, not the accuracy of every style judgment.
