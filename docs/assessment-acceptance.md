# Verify AI detection and rewriting

Use the Docker development stack with the [DOCX renderer](../services/renderer/README.md) and [detector](../services/detector/README.md) healthy and the worker running. Configure the DeepSeek model and API key. Only rewriting calls DeepSeek.

Run the automated checks:

```sh
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
python3 -m unittest discover -s services/renderer -v
```

Use synthetic documents for these flow checks:

1. Upload an English DOCX of thirty rendered pages or fewer. Confirm that detection finishes before editing starts and that no allowance slot is reserved.
2. Confirm that the result is labeled **AI detection rate** and shows a number out of 100.
3. Choose a rewrite strength and select **Unslopify**. Confirm that DeepSeek edits with the pinned unslop rules and that a validated DOCX is saved.
4. Confirm that the original is unchanged, both downloads are available, and the same rate stays in one circle. A rewrite that expands beyond thirty pages does not block the download.
5. Repeat with French prose long enough to need several model windows. Confirm that a rate appears. This step confirms coverage, not accuracy.
6. Upload a document that contains only quotation-styled text, then one under 50 words. Confirm that each shows an unavailable rate instead of zero, and that editing stays available.
7. Upload a thirty-one-page document. Confirm that the API rejects it before it saves a document record or private file. Cover pages, references, and blank pages count, and saved page metadata does not override rendering.
8. Stop the renderer and upload a document. Confirm that the upload is refused with a retry message. Stop the detector and upload a document. Confirm that the durable retry policy runs and that the workspace then offers **Retry assessment**.
9. Delete a queued or processing document. Confirm that no late result is accepted, any active rewrite reservation is released, and its private files are removed.

The [renderer smoke check](../services/renderer/README.md) verifies real page counts. Deployment also runs `tools/smoke-document-workflow.cjs` inside the API and worker images. That script verifies thirty-page acceptance, thirty-one-page rejection, and a synthetic detection and rewrite cycle. These checks validate the integration, not the accuracy of the rate.
