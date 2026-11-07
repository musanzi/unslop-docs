# Unslopy

Unslopy edits people's English and French documents so they read as human writing, while keeping their meaning.

## Language

**AI detection rate**:
The score from 0 to 100 that Unslopy's own detector gives a document or Scoring unit. It is a model score, not proof of authorship, and says nothing about other detectors.
_Avoid_: AI rate, AI slop rate, slop score

**Unslopify**:
The user-started process that edits a document's flagged text to lower its AI detection rate and remove AI writing patterns without changing its meaning.
_Avoid_: Humanize, rewrite pipeline

**Scoring unit**:
A group of consecutive paragraphs long enough for the detector to score reliably. It is the smallest piece of a document that is scored and edited.
_Avoid_: Sentence, chunk, passage

**Flagged**:
Describes a Scoring unit whose AI detection rate is high enough for Unslopify to edit it. Text that is not Flagged stays as the author wrote it.
_Avoid_: Sloppy, AI-written, detected

**Candidate**:
One proposed rewrite of a Scoring unit, competing with other Candidates for the same unit.
_Avoid_: Variant, attempt
