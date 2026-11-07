# Verify writing assessment and rewriting

Use the existing Docker development stack with the [DOCX renderer](../services/renderer/README.md) and [detector](../services/detector/README.md) healthy and the worker running. Configure the DeepSeek model and API key. Only rewriting calls DeepSeek.

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
2. Confirm that the result is labeled **AI detection rate** and shows a number out of 100.
3. Choose a rewrite strength and select **Unslopify**. Confirm that DeepSeek edits with the pinned unslop rules and a validated DOCX is saved.
4. Confirm that the original remains unchanged, both downloads are available, and the same rate stays in one circle. A rewrite that expands beyond thirty pages does not block the download.
5. Repeat with French prose long enough to need several model windows. Confirm that a rate appears. This confirms coverage, not accuracy.
6. Upload a document containing only quotation-styled text, then one under 50 words. Confirm an unavailable rate instead of zero, with editing still available.
7. Reject a thirty-one-page upload before a document record or private file is saved. Cover pages, references, and blank pages count. Saved page metadata does not override rendering.
8. Confirm that an unavailable renderer prevents upload acceptance with a retry message. An unavailable detector uses the durable retry policy and then offers **Retry assessment**.
9. Delete a queued or processing document. Confirm that no late result is accepted, any active rewrite reservation is released, and its private files are removed.

The [renderer smoke check](../services/renderer/README.md) verifies real page counts. Deployment also runs `tools/smoke-document-workflow.cjs` inside the API and worker images to verify thirty-page acceptance, thirty-one-page rejection, and a synthetic detection and rewrite cycle. These checks validate the integration, not the accuracy of the rate.
