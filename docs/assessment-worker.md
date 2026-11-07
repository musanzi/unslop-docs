# Assessment worker reference

The API saves a validated original and commits its `queued` document row in one transaction, queued for the initial assessment only. It does not import or call the DeepSeek provider. Existing originals retain `stored` status after migration and are not sent to a provider retroactively.

The worker claims a detection or a rewrite. Detection sends the assessed prose to the private [detector service](../services/detector/README.md) and sends nothing to DeepSeek. DeepSeek only edits, using the pinned unslop rules. After editing, the worker constructs and validates the revised DOCX, saves it, and publishes it. The revised document is not rated. [ADR 0009](adr/0009-score-the-ai-detection-rate-with-oculus.md) records the decision and the evidence behind it.

The stored `assessment` object records the status, rate, unavailable reason, raw model score, pinned model version, method, check time, input hash, character count, token count, and window count. The validator recomputes the rate from the raw score. The detail API returns the status, rate, reason, method, and check time.

Protected DOCX elements, quotation and code styles, and reference sections are excluded from the assessed prose. Empty prose produces the unavailable reason `no_prose` without calling the detector. The detector returns `too_short` under 50 words and `too_long` over 150,000 characters. None of these prevents editing.

## Settings

| Setting                     | Required | Default                | Meaning                                  |
| --------------------------- | -------- | ---------------------- | ---------------------------------------- |
| `DEEPSEEK_API_KEY`          | Yes      | None                   | Worker-only provider credential          |
| `DEEPSEEK_MODEL`            | Yes      | None                   | Explicit available model identifier      |
| `ASSESSMENT_TIMEOUT_MS`     | No       | `600000`               | Detection deadline from its claim        |
| `LOCAL_DETECTOR_TIMEOUT_MS` | No       | `600000`               | Maximum individual detector request wait |
| `LOCAL_DETECTOR_URL`        | No       | `http://detector:8090` | Private detector origin                  |
| `PROCESSING_TIMEOUT_MS`     | No       | `900000`               | Rewrite deadline from its claim          |
| `DEEPSEEK_TIMEOUT_MS`       | No       | `60000`                | Maximum individual DeepSeek request wait |

Choose a model that supports JSON output from [DeepSeek's model documentation](https://api-docs.deepseek.com/quick_start/pricing/). There is no implicit model fallback. All worker durations must be positive integer milliseconds at most `2147483647`. Time spent at the preview waiting for the user is outside both deadlines. The effective wait cannot exceed the persisted deadline. Startup reports missing settings by name without showing their values.

The worker disables LangChain verbose output and LangSmith tracing. The SDK logger is off, and provider exceptions become fixed failure messages. Neither provider responses nor document text are logged. Compose passes DeepSeek settings only to the worker. Tests inject fake providers or a fake HTTP transport. There is no runtime fake-provider flag or authentication bypass.

DeepSeek editing requests set `thinking: { type: 'disabled' }` so the 4,096-token response budget is available for JSON. DeepSeek enables thinking by default. A live check exhausted the budget on reasoning and returned no content. The [thinking-mode reference](https://api-docs.deepseek.com/guides/thinking_mode/) documents this setting.

## Lifecycle

Each document row carries a durable `phase`: `assessment` for automatic detection and `rewrite` for the user-requested rewrite. `queued` becomes `processing` on an atomic claim. An assessment claim needs no allowance reservation; a rewrite claim requires an active reservation. The claim sets the deadline for its phase, `processingStage` `assessing` or `editing`, and a 30-second lease renewed every 10 seconds and before each provider call. The processing deadline is persisted once and never extended by a heartbeat. A live worker performs recovery before each claim.

An assessment claim reads the original, requests `detection:initial:v1`, and publishes the validated result and preview in one update that sets `assessed`, clears the claim, stage, and deadline, and leaves no reservation. The document then waits for the user without a deadline. A failed detection sets `failed` with the phase `assessment`, no result, and nothing to release.

A rewrite claim edits each chunk with the persisted strength, reports completed and total chunks in `editingCompleted` and `editingTotal`, constructs and validates the revision, writes it under a new private key, and saves the key, size, and notices on the processing row. Publication then sets `completed`, clears the claim, stage, and progress, and charges the reservation in the same statement. Failure before the revision is saved sets `failed` with the phase `rewrite`, keeps the detection result, preview, and strength, releases the reservation, and removes the written file. Once the revision is saved, no failure discards it.

Recovery fails expired deadlines and lease-expired attempts that are not resumable, releasing their reservations, unless the row already holds a saved revision; those rows are published and charged. After lease expiry, recovery resumes attempts whose requests have only validated successes or scheduled temporary failures. A resumed attempt with a saved revision publishes it without editing again. Graceful shutdown aborts an active request and fails the claim. A scheduled retry holds no active lease and survives shutdown.

Publication requires the same claim token, `processing` state, and the phase-specific guards. A late provider response cannot replace failure or recreate a deleted document. SQL updates return rows through a common database boundary that the tests exercise in embedded PostgreSQL. `tools/check-allowance-postgres.cjs` runs the last-slot race, duplicate Unslopify and retry requests, month-boundary charging, and deletion contending with publication against a disposable real PostgreSQL database; `bash tools/check-allowance-postgres.sh [api-container]` runs it inside the API container.

Each provider request has its own finite wait, bounded by the remaining deadline of its phase. Both LangChain and its underlying SDK have zero retries. LangGraph nodes have no library retry policy. The worker persists request checkpoints in PostgreSQL and replays the graph using validated cached results when resuming an attempt. Each editing request has a stable chunk ID and produces independently validated span results. The [revision reference](document-revisions.md) describes construction and publication. Only validated revised output charges usage. The [queue decision](adr/0003-keep-document-jobs-in-postgresql.md) and [ADR 0005](adr/0005-separate-assessment-from-user-requested-editing.md) record the transaction boundaries.

## Private reads and progress

`GET /documents` includes `status`, `phase`, `processingStage`, `progress`, `strength`, and a fixed failure explanation. `GET /documents/:id` adds the `assessment` and `revisionNotices`. Results outside the detection contract return null. `GET /documents/:id/preview` returns the read-only preview published with the result: ordered blocks of kind `heading`, `paragraph`, `list-item`, `table`, or `protected`, with heading or list levels from 1, formatted inlines, table rows and cells, and protected element reasons. Another user, an admin, a malformed identifier, a missing document, and a document without a published preview receive the same 404 body. Signed-out callers receive 401. Responses use `Cache-Control: private, no-store`.

`POST /documents/:id/unslopify` accepts `{ "strength": 1..100 }`, defaulting to 50, for an owned `assessed` document. It locks the row, reserves one allowance slot, and queues the rewrite in the same transaction, persisting the strength with the attempt. A second click, a queued or processing rewrite, a completed document, and an unassessed document receive 409 without a second reservation; an exhausted allowance receives the same 409 explanation as before and leaves the preview available.

Progress is indeterminate during `assessing`, where `progress` is null. During `editing`, `progress` reports completed and total chunks, and construction and validation keep the final counts under `validating`. Reloading never restarts completed work because checkpoints survive claims. The original remains downloadable in all processing states. A `completed` document also exposes its validated revised download and a review reminder.

## Pinned rules and library references

The [vendored skill](../vendor/cursor-pstack-unslop/README.md) records the source revision, SHA-256, and MIT notice. Startup and an automated spec check the hash. The application never downloads rules at runtime.

Implementation checked the primary documentation for [LangChain ChatDeepSeek](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek), [LangGraph's graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), and [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/). DeepSeek JSON mode requires `response_format: { type: 'json_object' }` and a prompt that describes JSON output. Empty, truncated, or malformed output fails this slice. Installed library source confirms separate LangChain and SDK retry settings.

## Durable provider retries

The document row holds a processing attempt identifier, private request checkpoints, and the next eligible request time. Initial claims assign the attempt identifier and deadline. Resumed claims rotate the claim token and retain the attempt identifier, start time, and deadline.

`detection:initial:v1` identifies a detection, and `edit:<chunk ID>` identifies each planned editing request. Each checkpoint contains the input hash, call count, state, and either validated output or fixed failure metadata. The input hash covers the instructions and request data. A changed request fails recovery without another provider call. Detection checkpoints contain scores and metadata only, editing checkpoints contain document text only in validated outcomes, and all checkpoints remain excluded from normal entity selection and API responses and disappear with the document row.

Before a provider call, a guarded SQL update increments the call count and marks the request `running`. A validated response becomes `succeeded`. Temporary failures become `retry` after calls one and two, with delays of 1,000 and 2,000 milliseconds. PostgreSQL stores the next eligible time and expires the lease in the same update. The document remains `processing`, and the worker returns to its polling loop. Polling or other work can increase the effective delay. A resumed rewrite reuses successful chunk results without sending them again.

Timeouts, connection failures, HTTP 408, HTTP 429, and HTTP 5xx are temporary. Authentication failures, other request rejections, malformed or incomplete responses, output-validation failures, cancellation, and unknown errors receive no automatic retry. Failure metadata contains only a fixed category and an optional numeric HTTP status. Provider messages, bodies, headers, request IDs, credentials, and exception causes are discarded.

Every request start and checkpoint update requires the current claim token, processing state, valid lease, and unexpired deadline. A response received after timeout cannot update a checkpoint. A hard stop before the response checkpoint commits leaves `running`; recovery fails this unknown outcome instead of blindly repeating it. A hard stop after a success or retry checkpoint commits can resume safely. These boundaries provide at-most-three calls per request, not exactly-once provider execution across a network failure.

The phase deadline also bounds backoff and cached-result reconstruction. Recovery never extends it. Automatic retries create neither a new job nor a new processing attempt. Unslopify reserves once before the first editing request, and the reservation survives resumed claims. Charging and release belong to terminal transitions. An authorized user retry resets the request checkpoints and creates a distinct processing attempt on the next claim.

## User retries

`POST /documents/:id/retry` locks the owner-matched document row before checking that its status is `failed`, then branches on the failed phase. A failed initial assessment is queued again without any reservation. A failed rewrite acquires the owner lock through `MonthlyAllowance.reserve`, creates a new reservation, and is queued again with its initial assessment, preview, and strength intact. The reservation uses the time after the owner lock is acquired. A competing retry waits for the document lock and receives HTTP 409 after the first transaction queues it.

Queueing clears the previous failure, processing stage, claim token, lease, attempt identifier, start time, deadline, request checkpoints, and next request time. The original storage key, size, filename, and creation time stay unchanged. The next claim assigns a new attempt identifier and deadline. Each request gets its initial call and up to two automatic retries again. Old claim tokens cannot publish a result or release the new reservation.

The retry API makes no provider call. A rewrite retry returns HTTP 409 when the allowance is exhausted and leaves the failed document, its assessment, and its strength unchanged. Rollback removes the new reservation if queueing fails. A completed document whose final score is unavailable is not retried: its revision is published and charged, and no separate assessment action exists.

## Deletion

`DELETE /documents/:id` works in every state. It locks the owner-matched row, removes the original and any revised DOCX from private storage, and then deletes the row. The row carries the preview, both assessments, revision notices, and request checkpoints, so nothing of the document outlives it. Files go before the row: a removal failure returns HTTP 503 and leaves the record pointing at the remaining file, so the owner can repeat the deletion, and a file is never left without a record. Storage removal is idempotent, so a repeat after a lost database acknowledgement finishes the job. Another user and the admin receive the same HTTP 404 as a document that never existed, and so does a repeated delete once the document is gone; the web client treats that 404 as already deleted.

A completed document keeps its charged reservation, and an assessed preview or failed document has none to release. A queued or processing rewrite holds one active reservation, which the `release_document_reservation` trigger releases in the deletion transaction, so repeated deletes cannot release twice and the allowance refreshes at once. A queued or processing initial assessment holds no reservation, so deleting it changes no allowance and creates no credit.

Deleting an active document ends its attempt without a terminal transition. Every worker update is guarded by the row, so after the deletion commits the lease renewal, request checkpoints, stage and progress updates, assessment publication, revision saving, and completion all update zero rows. The worker treats that as a lost claim: it sends no further provider request for the document, including the remaining chunks of a rewrite and the automatic retries of a request that already failed temporarily, because a retry needs a claim and a claim needs a row. A request already in flight is aborted at the next heartbeat or on return; DeepSeek may still process the text it received, and the worker discards the answer. Recovery after a worker restart finds no row to resume or fail.

Deletion and publication contend for the row lock, and exactly one of two states results. If the deletion commits first, no record, file, or active reservation remains and nothing is charged; a late completion updates zero rows, and the worker removes the revised file it wrote once the record no longer owns that key. If publication commits first, the deletion sees the completed row, removes the original and the revised file, keeps the charge, and deletes the row. A rewrite deleted after saving its revision already has that key on the row; the deletion reads it and removes the file. Unslopify and retry lock the same row, so after a deletion they receive HTTP 404 and reserve nothing, and a deletion after them releases the one reservation they created. `tools/check-allowance-postgres.cjs` exercises both lock orderings against real PostgreSQL; the unit specs script each ordering deterministically through a fake provider whose calls delete the document before returning.

## Schema

Migration `1794049887155-Init` creates the whole schema, including the `uuid-ossp` extension, the `user` and `admin` roles, and the reservation trigger. Parts of it are hand-written because entities cannot describe them, so check any future `pnpm db:migrate` output for changes to those parts. Earlier migrations were removed when all data was cleared for the beta launch.
