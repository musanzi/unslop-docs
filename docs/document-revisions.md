# Revised document reference

An accepted upload runs only AI detection. Editing, construction, and validation start when the owner clicks **Unslopify**, and they run through LangGraph with the persisted rewrite strength. An unavailable rate does not prevent editing.

The LangChain `ChatDeepSeek` adapter sends every editing request. Both library retry settings stay at zero. The worker persists automatic retries per request, and the [worker reference](assessment-worker.md) describes reservations and charges.

## Editing and reconstruction

### Passages, spans, and chunks

`planDocxEdits` uses the immutable reader model, which comes from the normalized main part described in the [DOCX support reference](document-support.md).

Consecutive text nodes in one paragraph form one passage when both of these conditions hold:

- Their runs share bold, italic, hyperlink, and identical run properties.
- Only run tags, proofing marks, bookmarks, or rendered page breaks separate them.

Word splits such runs by editing session, so merging them gives the provider whole sentences instead of fragments. A passage does not cross tabs, line breaks, protected elements, or a formatting change. It ends before any trailing whitespace that the first text node could not preserve.

The planner applies these limits:

- A span holds at most 1,600 characters, and the planner prefers to split at spaces.
- A request holds at most 3,200 text characters and 24 spans.

Each span identifies the XML position of its first text node and its offset in the passage. Each chunk has a SHA-256 identifier derived from the normalized main part, the `docx-edit-v2` protocol version, and the ordered spans. Identical input produces identical boundaries and IDs.

### Provider responses

The provider returns one text replacement for every span, in order. Missing, duplicated, reordered, or malformed responses fail the attempt. Empty editable content needs no editing request. Protected content is never offered as an editable span. Fragmentary or uncertain prose can stay unchanged.

A failed check on one span does not stop the rest of the document:

- A replacement that is empty, oversized, or contains control characters keeps the original text with a `response` notice.
- A replacement that changes only leading or trailing whitespace is accepted, and the original whitespace is restored.
- A replacement that fails a citation, quotation, number, reference, or language check keeps the original span text with a notice that names the check.

Incomplete provider output never replaces text, and no material is dropped silently.

The graph collects validated results by chunk ID, and `constructRevisedDocx` requires every chunk before it constructs an archive. The worker persists validated request outcomes by processing attempt, operation, and chunk ID. Resumed attempts reuse successful chunks and revalidate them before construction. Failed or incomplete provider output is never cached as a success. The [worker reference](assessment-worker.md#durable-provider-retries) describes recovery and the shared deadline.

### Prompt

Preservation instructions take priority over the pinned skill. The prompt states the rewrite strength from 1 to 100:

| Strength  | Instruction                                      |
| --------- | ------------------------------------------------ |
| 1 to 33   | Make light edits and leave most spans untouched. |
| 34 to 66  | Edit the sentences that show patterns.           |
| 67 to 100 | Sentence-level rewriting is allowed.             |

Every level preserves facts and meaning. The prompt forbids translation, invented sources, deleted factual claims, and moving prose between spans. Source text is JSON-encoded in a separate user message and treated as untrusted data. Prompt separation constrains the request, but it does not prove that the model obeys.

### Construction

Construction replaces only text-node contents in the normalized main XML part. It writes a merged passage into the first text node of the passage and empties the others, so every run and its properties survive. XML escaping prevents model text from becoming markup.

Original run properties, list numbering, table markup, relationships, and protected inline XML survive. Other package parts are copied byte for byte. The original storage key is never written. The finished archive passes the existing reader and preservation checks before storage.

Construction also returns revision notices:

- `keptPassages` lists each span kept because of a failed check, with the check code, the span identifier, and an excerpt of at most 120 characters of the original passage.
- `uneditedElements` counts the protected elements by reason, such as `image`, `equation`, `reference-field`, `footnote`, `endnote`, `comment`, or `text-box`.

## Validation

### Structure

Validation compares ordered blocks, heading levels, paragraph styles, list numbering and nesting, table dimensions, run formatting, hyperlinks, and text-node counts. It also compares the main XML outside editable text with the normalized original. Images, equations, reference fields, footnotes, endnotes, comments, headers, footers, and other package parts keep their original bytes.

Construction rewrites only text-node contents, so the worker's own output passes these checks. They guard against a damaged archive or a reader regression, not against formatting differences that the user would accept.

### Text

Text checks compare recognized citations, quotations, numbers, month names, URLs, and reference markers at span, paragraph, and document level. A span-level failure keeps the original passage with a notice. A paragraph-level or document-level failure fails the attempt, which can happen when recognized content crosses two spans.

Language checks reuse the reader's English and French classification. Changed short or uncertain text must keep at least half of its distinct source words. A span that fails this check keeps its text with a `language` notice. Returning unchanged text is valid.

### Limits

These checks do not establish semantic equivalence, factual accuracy, or recognition of every citation convention. They cannot reliably detect all language changes in short or mixed passages. The model must preserve all claims and references, including those the recognizers miss. The UI asks owners to review the revised document before they submit it. Deterministic tests do not replace evaluation with the real provider.

### Failure codes

A `RevisionValidationError` has one fixed check code: `response`, `structure`, `formatting`, `protected`, `citation`, `quotation`, `reference`, `fact`, or `language`. The entry shows the matching fixed explanation and a suggested action. Logs contain the check code, never document text or model output. Validation failures use the same terminal transition as provider failures and receive no automatic retry.

## Publication and storage

The document row holds the revised key, revised byte size, processing stage, and nullable `revisionNotices` JSON. `processingStage` is `editing` or `validating` while a rewrite claim is active. The worker saves the revised key, size, and notices on the processing row. Publication then changes the status to `completed`, clears the claim and stage, and charges the reservation. `GET /documents/:id` returns `revisionNotices` for completed documents.

The rewrite deadline covers editing, construction, validation, and saving the revision. The worker renews its lease before each request and every 10 seconds. Saving the revision checks the claim token, status, lease, and deadline in one SQL update. Before that point, failure, expiry, deletion, or a replaced claim prevents publication, and a late provider callback cannot continue into storage. After that point, deadline expiry or lease loss publishes the revision instead of discarding it.

The worker writes only a complete, validated archive, under a new random key with private file permissions. If saving the revision is rejected, the worker removes that file. If the database acknowledgement is lost, the worker checks whether the completed row owns that key before cleanup. An unavailable database or a hard process stop can leave an inaccessible private orphan, because the worker never deletes a revision whose publication is uncertain. Partial model output is never exposed as a result. A future storage reconciliation task can remove confirmed orphans.

Development and production workers both mount the private documents volume for writing. The production worker uses the same `node` identity as the API. Neither mount is served publicly.

`GET /documents/:id/original` stays available to the owner in every state. `GET /documents/:id/revised` requires the owner and a completed document with revised metadata. Both endpoints return DOCX attachments and `Cache-Control: private, no-store`.

Signed-out requests receive 401. Other users, admins, unknown IDs, malformed IDs, and unavailable revisions receive the same 404 response. Storage keys never appear in an API response.
