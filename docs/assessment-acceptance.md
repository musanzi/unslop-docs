# Verify local detection and rewriting

Start the Docker development stack using the [local detector setup](../services/detector/README.md). Wait for the detector health check and worker startup. The first start downloads the model. Detection requires no subscription or API key. DeepSeek still requires its editing credentials.

Run the focused backend checks:

```sh
pnpm exec vitest run --config apps/api/vitest.config.mts assessment-workflow local-detector-provider deepseek-provider document-jobs
```

Use synthetic documents for manual checks. Do not infer detector accuracy from the model score of a single fixture.

1. Upload an English DOCX containing at least 50 words. Confirm that local detection finishes before editing starts and no allowance slot is reserved yet.
2. Confirm that the result is labeled **AI detection** and shows a model score out of 100. It must not claim an authorship percentage or university acceptance.
3. Choose a rewrite strength and select **Unslopify**. Confirm that DeepSeek edits with the pinned unslop instructions, a validated DOCX is saved, and local detection runs on the revised text.
4. Confirm that the original remains byte-for-byte unchanged and both downloads are available. A final score that rises must not block the revised download.
5. Repeat with a French DOCX and a document longer than one model window. Compare the recorded character count and text hash with the full extracted text. No tail may be silently omitted.
6. Upload a document below 50 words. Confirm that detection says unavailable, does not display zero, and still allows editing.
7. Stop the detector during a synthetic request. Confirm bounded retries and no published partial result. If final checking fails after a revision is saved, confirm that the revised download remains available with an unavailable final result.
8. Delete a queued or processing document. Confirm that the worker accepts no late result, releases any active rewrite reservation, and removes its private files.

Run the [detector service tests and real-model smoke test](../services/detector/README.md) to verify inference separately. The smoke test is not an accuracy benchmark. The current experimental detector can miss generated text, including French text.
