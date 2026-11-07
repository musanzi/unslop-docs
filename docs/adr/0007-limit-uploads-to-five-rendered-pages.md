# Limit uploads to five rendered pages

The owner accepted a five-page limit for new DOCX uploads on November 6, 2026. Render each document on the server and count all pages, including cover pages, references, and blank pages. The server's rendered count is authoritative and may differ from Word because of fonts and layout.

This replaces the 10,000-word product limit retained by ADR 0004. Keep the 10 MB upload limit, English and French support, and existing security checks. A word-count approximation or saved DOCX page metadata does not enforce the accepted page limit. This decision adds a rendering dependency and processing work to upload validation.

The page limit applies to new uploads. Preserve existing documents and downloads. A rewrite that expands beyond five pages remains downloadable under ADR 0004's tolerance for formatting differences.

[ADR 0008](0008-raise-the-upload-limit-to-thirty-rendered-pages.md) raises the accepted count to thirty pages. Everything else in this decision stands.

The page restriction runs at the upload boundary. The shared reader no longer applies the former word limit, so reading existing documents and validating revised downloads do not apply the upload page restriction again.
