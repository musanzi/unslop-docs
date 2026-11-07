# Assessment worker reference

The worker runs two kinds of job: AI detection after an upload, and a rewrite after the owner clicks **Unslopify**. Detection sends the assessed prose to the private [detector service](../services/detector/README.md) and sends nothing to DeepSeek. A rewrite sends text to DeepSeek with the pinned unslop rules, then builds, validates, saves, and publishes the revised DOCX. The worker does not rate the revised document. [ADR 0009](adr/0009-score-the-ai-detection-rate-with-oculus.md) records the decision and the evidence behind it.

The API saves a validated original and commits its `queued` row in one transaction, queued for detection only. The API does not import or call the DeepSeek provider. Originals in `stored` status stay there, and the worker does not send them to a provider.

## Detection results

The stored `assessment` object records the status, rate, unavailable reason, raw model score, pinned model version, method, check time, input hash, character count, token count, and window count. The validator recomputes the rate from the raw score. The detail API returns the status, rate, reason, method, and check time.

The assessed prose excludes protected DOCX elements, quotation and code styles, and reference sections. A rate can be unavailable for these reasons:

| Reason      | Cause                                                               |
| ----------- | ------------------------------------------------------------------- |
| `no_prose`  | The assessed prose is empty. The worker does not call the detector. |
| `too_short` | The detector received fewer than 50 words.                          |
| `too_long`  | The detector received more than 150,000 characters.                 |

An unavailable rate does not prevent editing.

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

Choose a model that supports JSON output from [DeepSeek's model documentation](https://api-docs.deepseek.com/quick_start/pricing/). The worker has no implicit model fallback. Startup reports missing settings by name without showing their values.

All worker durations must be positive integer milliseconds, at most `2147483647`. A request wait cannot exceed the persisted deadline. Time that a document spends waiting for the user in `assessed` status counts against neither deadline.

The worker turns off LangChain verbose output, LangSmith tracing, and the SDK logger. Provider exceptions become fixed failure messages. Logs contain neither provider responses nor document text. Compose passes DeepSeek settings only to the worker. Tests inject fake providers or a fake HTTP transport. No runtime flag enables a fake provider or bypasses authentication.

DeepSeek enables thinking by default. Editing requests set `thinking: { type: 'disabled' }` so that the full 4,096-token response budget is available for JSON. A live check with thinking on spent the budget on reasoning and returned no content. The [thinking-mode reference](https://api-docs.deepseek.com/guides/thinking_mode/) documents this setting.

## Lifecycle

Each document row has a durable `phase`: `assessment` for automatic detection and `rewrite` for the user-requested rewrite. An atomic claim moves a row from `queued` to `processing`. An assessment claim needs no allowance reservation. A rewrite claim requires an active reservation.

The claim sets these values:

- The deadline for its phase. The worker persists the deadline once, and a heartbeat never extends it.
- The `processingStage`, which is `assessing` or `editing`.
- A 30-second lease, which the worker renews every 10 seconds and before each provider call.

A live worker runs recovery before each claim.

### Detection claims

The worker reads the original and requests `detection:initial:v1`. One update then publishes the validated result and preview, sets `assessed`, and clears the claim, stage, and deadline. The document holds no reservation and waits for the user without a deadline.

A failed detection sets `failed` with the phase `assessment` and no result. It has nothing to release.

### Rewrite claims

The worker edits each chunk with the persisted strength and reports completed and total chunks in `editingCompleted` and `editingTotal`. It then constructs and validates the revision, writes it under a new private key, and saves the key, size, and notices on the processing row. Publication sets `completed`, clears the claim, stage, and progress, and charges the reservation in the same statement.

A failure before the revision is saved sets `failed` with the phase `rewrite`. That transition keeps the detection result, preview, and strength, releases the reservation, and removes the written file. After the revision is saved, no failure discards it.

### Recovery and shutdown

Recovery handles expired attempts in these ways:

- It publishes and charges any row that already holds a saved revision, without editing again.
- After lease expiry, it resumes attempts whose requests have only validated successes or scheduled temporary failures.
- It fails every other attempt with an expired deadline or lease, and releases its reservation.

Graceful shutdown aborts an active request and fails the claim. A scheduled retry holds no active lease and survives shutdown.

### Publication guards

Publication requires the same claim token, `processing` state, and the guards of the phase. A late provider response cannot replace a failure or recreate a deleted document. Queue SQL runs through the `JobDatabase` interface, and the tests run that SQL in embedded PostgreSQL.

`tools/check-allowance-postgres.cjs` runs four scenarios against a disposable real PostgreSQL database: the last-slot race, duplicate Unslopify and retry requests, month-boundary charging, and deletion contending with publication. To run it inside the API container, use `bash tools/check-allowance-postgres.sh [api-container]`.

### Provider requests

Each provider request has its own finite wait, bounded by the remaining deadline of its phase. LangChain and its underlying SDK both have zero retries, and LangGraph nodes have no library retry policy. The worker persists request checkpoints in PostgreSQL and replays the graph with validated cached results when it resumes an attempt.

Each editing request has a stable chunk ID and produces independently validated span results. Only validated revised output charges usage. The [revision reference](document-revisions.md) describes construction and publication. The [queue decision](adr/0003-keep-document-jobs-in-postgresql.md) and [ADR 0005](adr/0005-separate-assessment-from-user-requested-editing.md) record the transaction boundaries.

## Private reads and progress

`GET /documents` includes `status`, `phase`, `processingStage`, `progress`, `strength`, and a fixed failure explanation. `GET /documents/:id` adds `assessment` and `revisionNotices`. A stored result outside the detection contract returns null.

`GET /documents/:id/preview` returns the read-only preview published with the result. The web app does not call this endpoint. The preview contains these fields:

- Ordered blocks of kind `heading`, `paragraph`, `list-item`, `table`, or `protected`.
- Heading and list levels, starting from 1.
- Formatted inlines, table rows and cells, and the reasons for protected elements.

Another user, an admin, a malformed identifier, a missing document, and a document without a published preview all receive the same 404 body. Signed-out callers receive 401. Responses use `Cache-Control: private, no-store`.

`POST /documents/:id/unslopify` accepts `{ "strength": 1..100 }` for an owned `assessed` document. The default strength is 50. In one transaction, the endpoint locks the row, reserves one allowance slot, queues the rewrite, and persists the strength with the attempt.

These requests receive 409 without a second reservation: a second click, a queued or processing rewrite, a completed document, and an unassessed document. An exhausted allowance also receives 409, with a message that gives the allowance and its reset date. The document stays `assessed`.

Progress depends on the stage:

- During `assessing`, `progress` is null and the progress display is indeterminate.
- During `editing`, `progress` reports completed and total chunks.
- During `validating`, construction and validation keep the final counts.

Checkpoints survive claims, so a reload never restarts completed work. The original stays downloadable in all processing states. A `completed` document also exposes its validated revised download and a review reminder.

## Pinned rules and library references

The [vendored skill](../vendor/cursor-pstack-unslop/README.md) records the source revision, SHA-256, and MIT notice. Startup and an automated spec check the hash. The application never downloads rules at runtime.

The implementation follows the primary documentation for [LangChain ChatDeepSeek](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek), [LangGraph's graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), and [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/). DeepSeek JSON mode requires `response_format: { type: 'json_object' }` and a prompt that describes JSON output. Empty, truncated, or malformed output fails the attempt. The installed library source confirms that LangChain and the SDK have separate retry settings.

## Durable provider retries

The document row holds a processing attempt identifier, private request checkpoints, and the next eligible request time. An initial claim assigns the attempt identifier and deadline. A resumed claim rotates the claim token and keeps the attempt identifier, start time, and deadline.

### Checkpoints

`detection:initial:v1` identifies a detection, and `edit:<chunk ID>` identifies each planned editing request. Each checkpoint contains the input hash, call count, state, and either validated output or fixed failure metadata. The input hash covers the instructions and the request data. If a request changes, recovery fails it without another provider call.

Detection checkpoints contain only scores and metadata. Editing checkpoints contain document text only in validated outcomes. Normal entity selection and API responses exclude all checkpoints, and checkpoints disappear with the document row.

### Call sequence

Before a provider call, a guarded SQL update increments the call count and marks the request `running`. A validated response becomes `succeeded`.

Temporary failures become `retry` after calls one and two, with delays of 1,000 and 2,000 milliseconds. PostgreSQL stores the next eligible time and expires the lease in the same update. The document stays `processing`, and the worker returns to its polling loop. Polling or other work can make the delay longer. A resumed rewrite reuses successful chunk results without sending them again.

### Failure categories

Timeouts, connection failures, HTTP 408, HTTP 429, and HTTP 5xx are temporary. These failures receive no automatic retry:

- Authentication failures and other request rejections.
- Malformed or incomplete responses and output-validation failures.
- Cancellation and unknown errors.

Failure metadata contains only a fixed category and an optional numeric HTTP status. The worker discards provider messages, bodies, headers, request IDs, credentials, and exception causes.

### Guards and limits

Every request start and checkpoint update requires the current claim token, the processing state, a valid lease, and an unexpired deadline. A response received after a timeout cannot update a checkpoint.

A hard stop before the response checkpoint commits leaves the request `running`. Recovery fails that unknown outcome instead of repeating it. A hard stop after a success or retry checkpoint commits can resume safely. Each request gets at most three calls, but this is not exactly-once execution across a network failure.

The phase deadline also limits backoff and the reconstruction of cached results, and recovery never extends it. Automatic retries create neither a new job nor a new processing attempt. Unslopify reserves once before the first editing request, and the reservation survives resumed claims. Only terminal transitions charge or release it. An authorized user retry resets the request checkpoints and creates a new processing attempt on the next claim.

## User retries

`POST /documents/:id/retry` locks the owner-matched row, checks that its status is `failed`, and then branches on the failed phase:

- A failed detection is queued again without a reservation.
- A failed rewrite takes the owner lock through `MonthlyAllowance.reserve`, creates a new reservation, and is queued again with its detection result, preview, and strength intact. The reservation uses the time after the owner lock is acquired.

A competing retry waits for the document lock and receives HTTP 409 after the first transaction queues the document.

Queueing clears the previous failure, processing stage, claim token, lease, attempt identifier, start time, deadline, request checkpoints, and next request time. The original storage key, size, filename, and creation time stay unchanged. The next claim assigns a new attempt identifier and deadline. Each request again gets its initial call and up to two automatic retries. Old claim tokens cannot publish a result or release the new reservation.

The retry API makes no provider call. A rewrite retry returns HTTP 409 when the allowance is exhausted and leaves the failed document, its detection result, and its strength unchanged. If queueing fails, rollback removes the new reservation.

## Deletion

`DELETE /documents/:id` works in every state. It locks the owner-matched row, removes the original and any revised DOCX from private storage, and then deletes the row. The row holds the preview, the detection result, revision notices, and request checkpoints, so none of them outlives the document.

The endpoint removes files before the row, so a file is never left without a record. If a removal fails, the endpoint returns HTTP 503 and the record still points at the remaining file. The owner can repeat the deletion. Storage removal is idempotent, so a repeat after a lost database acknowledgement finishes the job.

Another user and the admin receive the same HTTP 404 as a document that never existed. A repeated delete receives that 404 too, and the web client treats it as already deleted.

### Reservations

| Document state                 | Reservation                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Completed                      | Keeps its charged reservation.                                                                                    |
| Assessed or failed             | Has no reservation to release.                                                                                    |
| Queued or processing rewrite   | Holds one active reservation. The `release_document_reservation` trigger releases it in the deletion transaction. |
| Queued or processing detection | Has no reservation. Deletion changes no allowance and creates no credit.                                          |

The trigger runs with the row deletion, so repeated deletes cannot release twice and the allowance refreshes at once.

### Active attempts

Deleting an active document ends its attempt without a terminal transition. The row guards every worker update. After the deletion commits, lease renewal, request checkpoints, stage and progress updates, detection publication, revision saving, and completion all update zero rows.

The worker treats a zero-row update as a lost claim. It sends no further provider request for the document, including the remaining chunks of a rewrite and the automatic retries of a request that failed temporarily. A retry needs a claim, and a claim needs a row.

The worker aborts a request in flight at the next heartbeat or on return. DeepSeek may still process the text it received, and the worker discards the answer. Recovery after a worker restart finds no row to resume or fail.

### Deletion and publication

Deletion and publication contend for the row lock, and one of two outcomes results:

- If the deletion commits first, no record, file, or active reservation remains, and nothing is charged. A late completion updates zero rows. The worker removes the revised file it wrote once the record no longer owns that key.
- If publication commits first, the deletion sees the completed row, removes the original and the revised file, keeps the charge, and deletes the row.

A rewrite deleted after it saved its revision already has that key on the row, so the deletion reads the key and removes the file. Unslopify and retry lock the same row. After a deletion they receive HTTP 404 and reserve nothing. A deletion after them releases the one reservation they created.

`tools/check-allowance-postgres.cjs` exercises both lock orderings against real PostgreSQL. The unit specs script each ordering through a fake provider whose calls delete the document before returning.

## Schema

Migration `1794049887155-Init` creates the whole schema, including the `uuid-ossp` extension, the `user` and `admin` roles, and the reservation trigger. Entities cannot describe some of these parts, so they are hand-written. Check any future `pnpm db:migrate` output for changes to them. Earlier migrations were removed when all data was cleared for the beta launch.
