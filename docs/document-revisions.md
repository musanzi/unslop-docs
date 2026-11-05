# Revised document reference

An accepted upload runs assessment, editing, construction, and validation automatically through LangGraph. An empty assessment does not skip editing. The existing LangChain `ChatDeepSeek` adapter sends every provider request. Both library retry settings remain zero. The worker persists automatic retries per request; issue #9 owns reservations and charges.

## Editing and reconstruction

`planDocxEdits` uses the immutable reader model from #5. It splits editable text nodes into spans of at most 1,600 characters, preferring spaces. Requests contain at most 3,200 text characters and 24 spans. Each span identifies its original XML position and fragment offset. Each chunk has a SHA-256 identifier derived from the original main part, protocol version, and ordered spans. Identical input produces identical boundaries and IDs.

The provider returns one text replacement for every span, in order. Missing, duplicated, reordered, malformed, or oversized results fail. Empty editable content requires no editing request. Protected content is never offered as an editable span. Fragmentary or uncertain prose can remain unchanged.

The graph collects validated results by chunk ID. `constructRevisedDocx` requires every chunk before constructing an archive. The worker persists validated request outcomes by processing attempt, operation, and chunk ID. Resumed attempts reuse successful chunks and revalidate them before construction. Failed or incomplete provider output is never cached as a success. The [worker reference](assessment-worker.md#durable-provider-retries) describes recovery and the shared deadline.

The pinned skill is subordinate to preservation instructions. The prompt forbids translation, invented sources, deleted factual claims, and moving prose between spans. Source text is JSON-encoded in a separate user message and treated as untrusted data. Prompt separation constrains the request; it does not prove model obedience.

Construction replaces only text-node contents in the original main XML part. XML escaping prevents model text from becoming markup. Original run properties, list numbering, table markup, relationships, and protected inline XML survive. Other package parts are copied byte-for-byte. The original storage key is never written. The finished archive passes the existing reader and preservation checks before storage.

## Validation

Validation compares ordered blocks, heading levels, paragraph styles, list numbering and nesting, table dimensions, run formatting, hyperlinks, and text-node counts. It also compares the main XML outside editable text. Images, equations, reference fields, footnotes, endnotes, comments, headers, footers, and other package parts retain their original bytes.

Text checks compare recognized citations, quotations, numbers, month names, URLs, and reference markers at span, paragraph, and document level. They reject missing or changed recognized content and added recognized references. Language checks reuse the reader's English/French classification. Changed short or uncertain text must retain at least half its distinct source words. This conservative check can reject a legitimate extensive rewrite. Returning unchanged text remains valid.

These checks do not establish semantic equivalence, factual accuracy, or exhaustive recognition of every citation convention. They cannot reliably distinguish all language changes in short or mixed passages. The model must preserve all claims and references, including those outside the recognizers. The UI asks owners to review the revised document before submitting it. Real provider evaluation remains necessary alongside deterministic tests.

A `RevisionValidationError` has one fixed check code: `response`, `structure`, `formatting`, `protected`, `citation`, `quotation`, `reference`, `fact`, or `language`. The entry displays the corresponding fixed explanation and a suggested action. Logs contain the check code, never document text or model output. Validation failures use the same terminal transition as provider failures and have no automatic retry.

## Publication and storage

Migration `1793880400000-DocumentRevision` adds the revised key, revised byte size, and processing stage. Existing stored or assessed documents remain unchanged and are not reprocessed. `processingStage` is `assessing`, `editing`, or `validating` while a claim is active. Successful publication changes the status to `completed`, saves the assessment and revised metadata together, and clears the claim and stage.

The original deadline covers the whole attempt. The worker renews its lease before each request and every ten seconds. Publication checks the claim token, status, lease, and deadline in the same SQL update. Failure, expiry, deletion, or a replaced claim prevents publication. A late provider callback cannot continue into storage.

Only a complete, validated archive is written under a new random key with private file permissions. If publication is rejected, the worker removes that file. If the database acknowledgement is lost, it checks whether the completed row owns that key before cleanup. An unavailable database or hard process stop can leave an inaccessible private orphan; the worker never risks deleting a revision whose publication is uncertain. No partial model output is exposed as a result. A future storage reconciliation task can remove confirmed orphans.

Both development and production workers mount the private documents volume for writing. The production worker uses the same `node` identity as the API. Neither mount is served publicly.

`GET /documents/:id/original` remains available to the owner in every state. `GET /documents/:id/revised` requires the owner and a completed document with revised metadata. Both endpoints return DOCX attachments and `Cache-Control: private, no-store`. Signed-out requests receive 401. Other users, admins, unknown IDs, malformed IDs, and unavailable revisions receive the same 404 response. Storage keys never appear in the API response.

Rolling back the migration returns completed entries to assessed state and drops revised metadata. Private files remain on disk for deliberate recovery or cleanup. Rollback does not modify originals.
