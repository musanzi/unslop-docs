# Assessment worker reference

The API saves a validated original and commits its `queued` document row in one transaction. It does not import or call the DeepSeek provider. Existing originals retain `stored` status after migration and are not sent to a provider retroactively.

The separate worker uses PostgreSQL to claim work and LangGraph to run assessment, editing, construction, and validation. The assessment subgraph executes `assess` followed by `validateAssessment`. The `assess` node calls LangChain's `ChatDeepSeek`. The validation node accepts numbered rules from the pinned skill, keeps exact source quotations, merges duplicate rules, and drops unknown rules or examples. Pattern names come from local constants. Model summaries, scores, and authorship claims are not published. An empty validated pattern list means no writing patterns were found. Malformed or incomplete output fails without publishing a partial assessment.

The worker reads text with the DOCX reader from #5. Document text is JSON-encoded in a user message, separate from system rules. The prompt treats document instructions as data and applies general prose rules to English and French. English vocabulary examples are not a literal French blacklist. Prompt separation and output validation constrain the result but do not prove a model's interpretation of prose.

## Settings

| Setting                 | Required | Default  | Meaning                                |
| ----------------------- | -------- | -------- | -------------------------------------- |
| `DEEPSEEK_API_KEY`      | Yes      | None     | Worker-only provider credential        |
| `DEEPSEEK_MODEL`        | Yes      | None     | Explicit available model identifier    |
| `PROCESSING_TIMEOUT_MS` | No       | `900000` | Deadline measured from the first claim |
| `DEEPSEEK_TIMEOUT_MS`   | No       | `60000`  | Maximum provider wait                  |

Choose a model that supports JSON output from [DeepSeek's model documentation](https://api-docs.deepseek.com/quick_start/pricing/). There is no implicit model fallback. Both durations must be positive integer milliseconds at most `2147483647`. The effective wait cannot exceed the persisted deadline. Startup reports missing settings by name without showing their values.

The worker disables LangChain verbose output and LangSmith tracing. The SDK logger is off, and provider exceptions become fixed failure messages. Neither provider responses nor document text are logged. Compose passes DeepSeek settings only to the worker. Tests inject fake providers or a fake HTTP transport. There is no runtime fake-provider flag or authentication bypass.

Assessment and editing requests set `thinking: { type: 'disabled' }` so the 4,096-token response budget is available for JSON. DeepSeek enables thinking by default. A live check exhausted the budget on reasoning and returned no content. The [thinking-mode reference](https://api-docs.deepseek.com/guides/thinking_mode/) documents this setting.

## Lifecycle

`queued` becomes `processing` on an atomic claim. The claim has a 30-second lease renewed every 10 seconds and before the provider call. The processing deadline is persisted once and never extended by a heartbeat. Recovery fails expired deadlines. After lease expiry, it resumes attempts whose requests have only validated successes or scheduled temporary failures. It fails attempts with no checkpoint, an in-flight request of unknown outcome, or a terminal request failure. Graceful shutdown aborts an active request and fails its claim. A scheduled retry holds no active lease and survives shutdown. A live worker is required to perform recovery.

Publication requires the same claim token, `processing` state, and unexpired deadline and lease. A late provider response cannot replace failure or recreate a deleted document. Failure clears assessment data. SQL updates return rows through a common database boundary that the tests exercise in embedded PostgreSQL. The real PostgreSQL deployment still needs concurrent-worker and restart smoke checks.

The processing deadline covers all requests, construction, validation, and publication. Each provider request has its own finite wait, bounded by the remaining processing deadline. Both LangChain and its underlying SDK have zero retries. LangGraph nodes have no library retry policy. The worker persists request checkpoints in PostgreSQL and replays the graph using validated cached results when resuming an attempt. The workflow continues into editing after validated assessment, even when no patterns were found. No confirmation step is required. Each editing request has a stable chunk ID and produces independently validated span results. The [revision reference](document-revisions.md) describes construction and publication. Issue #9 adds reservation before the first provider request and charging only after validated revised output. The [queue decision](adr/0003-keep-document-jobs-in-postgresql.md) records the transaction boundaries those slices must preserve.

## Private reads and progress

`GET /documents` includes status and a fixed failure explanation without assessment examples. `GET /documents/:id` returns the owner's status and validated assessment. Another user, an admin, a malformed identifier, and a missing document receive the same 404 body. Signed-out callers receive 401. Responses use `Cache-Control: private, no-store`.

The Angular workspace polls the visible history and selected document every five seconds while the tab is visible. Polling stops when the workspace is destroyed. Each response is checked against its request and selection so an older request cannot populate a different document. Failed refreshes show an error and continue polling. The original remains downloadable in all processing states. During processing, `processingStage` reports `assessing`, `editing`, or `validating`. A `completed` document also exposes its validated revised download and a review reminder.

## Pinned rules and library references

The [vendored skill](../vendor/cursor-pstack-unslop/README.md) records the source revision, SHA-256, and MIT notice. Startup and an automated spec check the hash. The application never downloads rules at runtime.

Implementation checked the primary documentation for [LangChain ChatDeepSeek](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek), [LangGraph's graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), and [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/). DeepSeek JSON mode requires `response_format: { type: 'json_object' }` and a prompt that describes JSON output. Empty, truncated, or malformed output fails this slice. Installed library source confirms separate LangChain and SDK retry settings.

## Durable provider retries

Migration `1793880500000-ProviderRetries` adds a processing attempt identifier, private request checkpoints, and the next eligible request time to the existing document row. Initial claims assign the attempt identifier and deadline. Resumed claims rotate the claim token and retain the attempt identifier, start time, and deadline.

`assess:v1` identifies assessment. `edit:<chunk ID>` identifies each planned editing request. Each checkpoint contains the input hash, call count, state, and either validated output or fixed failure metadata. The input hash covers the instructions and request data. A changed request fails recovery without another provider call. Checkpoints contain document text only in validated outcomes, remain excluded from normal entity selection and API responses, and disappear with the document row.

Before a provider call, a guarded SQL update increments the call count and marks the request `running`. A validated response becomes `succeeded`. Temporary failures become `retry` after calls one and two, with delays of 1,000 and 2,000 milliseconds. PostgreSQL stores the next eligible time and expires the lease in the same update. The document remains `processing`, and the worker returns to its polling loop. Polling or other work can increase the effective delay. A resumed graph reuses successful assessment and chunk results without sending them again.

Timeouts, connection failures, HTTP 408, HTTP 429, and HTTP 5xx are temporary. Authentication failures, other request rejections, malformed or incomplete responses, output-validation failures, cancellation, and unknown errors receive no automatic retry. Failure metadata contains only a fixed category and an optional numeric HTTP status. Provider messages, bodies, headers, request IDs, credentials, and exception causes are discarded.

Every request start and checkpoint update requires the current claim token, processing state, valid lease, and unexpired deadline. A response received after timeout cannot update a checkpoint. A hard stop before the response checkpoint commits leaves `running`; recovery fails this unknown outcome instead of blindly repeating it. A hard stop after a success or retry checkpoint commits can resume safely. These boundaries provide at-most-three calls per request, not exactly-once provider execution across a network failure.

The processing deadline also bounds backoff and cached-result reconstruction. Recovery never extends it. Automatic retries create neither a new job nor a new processing attempt. Issue #9 must reserve once after upload validation and before the first provider request, then retain that reservation across resumed claims. Charging and release belong to terminal transitions. Issue #10 must create a distinct attempt and reset request checkpoints only for an authorized user retry.

Stop workers before rolling back the retry migration. Rollback fails active attempts that use checkpoints, then removes retry metadata. Originals, completed assessments, and revised files remain intact.
