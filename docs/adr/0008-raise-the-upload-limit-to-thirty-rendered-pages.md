# Raise the upload limit to thirty rendered pages

The owner raised the limit for new DOCX uploads from five to thirty rendered pages on November 7, 2026. A five-page ceiling rejected ordinary coursework, including a 27-page document the owner uploaded. Thirty pages admits reports and dissertation chapters while still rejecting documents far outside the product's purpose.

This changes only the accepted count in [ADR 0007](0007-limit-uploads-to-five-rendered-pages.md). The server's rendered count stays authoritative, cover pages, references, and blank pages still count, the restriction still applies only to new uploads, and the 10 MB upload limit, English and French support, and existing security checks stay in place. Existing documents and longer revised downloads remain available.

A thirty-page document costs about six times the rendering, assessment, and editing work of a five-page one. Assessment batches its sentences and editing chunks its spans, so both scale with document length instead of failing on long input. The editing stage runs its provider calls in sequence, so a document near the new ceiling can approach `PROCESSING_TIMEOUT_MS`, which defaults to 15 minutes. Raise that timeout if long uploads begin to time out.
