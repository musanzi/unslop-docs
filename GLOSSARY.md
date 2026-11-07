# Unslop-docs

Unslop-docs helps students edit documents and download the revised documents.

## Language

**Document**: A user's uploaded work, including its original and any revised version. Only its owner can view or download it.

**FREE**: A user status with an allowance of three documents per month.

**PREMIUM**: A user status with an allowance of 15 documents per month.

**GOLD**: A user status with an allowance of 35 documents per month.

**Admin**: The person who manually changes users' statuses.

**AI detection**: The automatic check that scores an original document with the pinned Oculus model and reports its AI detection rate.

**AI detection rate**: The Oculus score for a document, out of 100. It is the token-weighted mean of the model's scores for the document's assessed prose. It is a model score, not a calibrated probability.

**Assessed prose**: The document's own prose, including prose in tables, that contributes to its AI detection rate. Quotation and code styles and reference lists are excluded.

**Unslop**: Editing that removes the specified writing patterns while preserving the document's meaning, language, citations, quotations, and factual claims.

**Rewrite strength**: The user's chosen extent of editing, from light edits to thorough rewriting. It does not promise a particular reduction in the AI detection rate.

**Monthly allowance**: The maximum number of successful documents charged to a calendar month, measured in UTC. A document belongs to the month when its reservation was created.

**Reservation**: One document allowance slot held when the user starts Unslopify. Assessment and time spent viewing its result do not hold a slot. Failure or deletion during editing releases the reservation.

**Status change**: An admin's change to a user's FREE, PREMIUM, or GOLD status. The change applies immediately without resetting usage.

**Queued document**: A document waiting for its AI detection or a user-requested rewrite to start.

**Processing document**: A document whose AI detection, editing, or validation is in progress.

**Assessed document**: A document with a complete AI detection rate that the user can review before choosing to start Unslopify. Assessment alone does not mean editing has succeeded.

**Revised document**: The edited DOCX whose formatting matches the original as closely as practical. Its owner can download it separately from the original and reviews and adjusts it before use.

**Revision notice**: A record stored with a completed revision that names each passage kept unchanged after a failed citation, quotation, number, reference, or language check, and counts the protected elements left unedited. It does not claim that the rest of the document is semantically equivalent.

**Completed document**: A document whose revised DOCX is ready to download, with the AI detection rate of its original.

**Failed document**: A document whose processing ended without a usable result. Its original remains available.

**Processing deadline**: The latest time an active document may finish processing. Starting processing fixes this time for that attempt.

**Processing attempt**: One run of assessment or a user-requested rewrite for a document, bounded by one processing deadline. Automatic provider retries belong to that same attempt.

**Automatic provider retry**: Another call for the same AI detection or editing chunk after a temporary provider failure. Each request permits two retries after its initial call.
