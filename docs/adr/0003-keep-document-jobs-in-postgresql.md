# Keep document jobs in PostgreSQL

Use each document's durable processing state as its queue entry. The API commits the queued state with the upload metadata, so publication cannot succeed without queueing. A separate Redis queue would need an outbox and reconciliation to provide the same guarantee.

Workers claim queued rows with `FOR UPDATE SKIP LOCKED` and assign a unique claim token, a processing deadline, and a renewable lease. Publication checks that token, the processing state, the lease, and the deadline in one database update. Lease expiry ends interrupted work as failed rather than repeating a provider request whose outcome is unknown. Recovery runs before each claim. Queued work remains queued across restarts.

PostgreSQL owns lifecycle transitions. LangGraph runs the assessment and validation nodes within a claim, without a second persistent checkpoint store. Issue #7 can connect an editing node after assessment validation. Issue #9 must reserve in the claim transaction before a provider call and release or charge in the terminal transition transaction. Issue #12 must invalidate the claim in that same lifecycle. Assessment completion is not allowance success.

This choice couples the queue to the document schema and PostgreSQL locking. Moving to a separate queue requires a lifecycle migration and atomic publication strategy. Redis still holds sessions and cache.
