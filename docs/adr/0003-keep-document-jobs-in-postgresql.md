# Keep document jobs in PostgreSQL

Use each document's durable processing state as its queue entry. The API commits the queued state with the upload metadata, so publication cannot succeed without queueing. A separate Redis queue would need an outbox and reconciliation to provide the same guarantee.

Workers claim queued rows with `FOR UPDATE SKIP LOCKED` and assign a unique claim token, a processing deadline, and a renewable lease. Publication checks that token, the processing state, the lease, and the deadline in one database update. Lease expiry ends a provider request of unknown outcome as failed rather than repeating it blindly. Recovery runs before each claim. Queued work remains queued across restarts.

PostgreSQL owns lifecycle transitions. LangGraph runs assessment, editing, construction, and validation within a claim, without a second persistent checkpoint store. Editing follows assessment validation automatically. Successful publication saves the complete revised document and assessment together. Issue #9 must reserve in the claim transaction before a provider call and release or charge in the terminal transition transaction. Issue #12 must invalidate the claim in that same lifecycle. Assessment completion is not allowance success.

This choice couples the queue to the document schema and PostgreSQL locking. Moving to a separate queue requires a lifecycle migration and atomic publication strategy. Redis still holds sessions and cache.

## Request checkpoints and recovery

Issue #8 keeps request checkpoints on the document row in PostgreSQL. The processing attempt identifier and original deadline survive renewed claims. Request identifiers distinguish assessment from each stable editing chunk. A request input hash prevents reuse after a change to its instructions or data. Storing a second set of durable LangGraph checkpoints would require coordinating two sources of lifecycle state, so the graph instead replays using PostgreSQL outcomes.

The worker persists the call count before sending each request. It checkpoints validated success or a sanitized temporary failure afterward. Scheduling a retry commits its due time and releases the lease together. After lease expiry, a worker can reclaim attempts containing only successes and scheduled retries. The new claim token fences out the old worker. Successful requests are not sent again.

A request left in flight after a crash has an unknown outcome. Recovery still fails that attempt, even if its call budget is not exhausted. Repeating it might improve availability but could repeat provider work with no trustworthy result record. A network timeout reported to a live worker is a known temporary failure and can use the remaining bounded retries. Neither case creates a new processing attempt or extends the deadline.

The additional persisted document text is limited to validated request results and stays private. Deleting the document removes its checkpoints. This design accepts repeated graph traversal and reconstruction in exchange for one transactional lifecycle store and no repeated successful provider calls.
