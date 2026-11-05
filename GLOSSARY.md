# Unslop-docs

Unslop-docs helps students edit documents and download the revised documents.

## Language

**Document**: A user's uploaded work, including its original and any revised version. Only its owner can view or download it.

**FREE**: A user status with an allowance of three documents per month.

**PREMIUM**: A user status with an allowance of 15 documents per month.

**GOLD**: A user status with an allowance of 35 documents per month.

**Admin**: The person who manually changes users' statuses.

**Writing assessment**: A report of writing patterns with examples from a document. It does not establish whether AI wrote the document.
_Avoid_: AI detection rate, AI authorship percentage.

**Unslop**: Editing that removes the specified writing patterns while preserving the document's meaning, language, citations, quotations, and factual claims.

**Monthly allowance**: The maximum number of successful documents charged to a calendar month, measured in UTC. A document belongs to the month when its reservation was created.

**Reservation**: One allowance slot held while a document is processing. Failure or deletion during processing releases the reservation.

**Status change**: An admin's change to a user's FREE, PREMIUM, or GOLD status. The change applies immediately without resetting usage.

**Queued document**: An accepted upload waiting for its writing assessment to start.

**Processing document**: A document whose writing assessment, editing, or validation is in progress.

**Assessed document**: A document with a complete writing assessment. Assessment alone does not mean editing has succeeded.

**Revised document**: The edited DOCX that passes the document preservation checks. Its owner can download it separately from the original and reviews it before use.

**Completed document**: A document with a writing assessment and a validated revised document.

**Failed document**: A document whose processing ended without a usable result. Its original remains available.

**Processing deadline**: The latest time an active document may finish processing. Starting processing fixes this time for that attempt.
