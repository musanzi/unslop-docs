# 05: Reject documents the editor cannot process

## What to build

When a user uploads a DOCX that the first release cannot process, the upload fails at once and tells the user what to change. This happens before any assessment or editing, so a rejected file never reaches DeepSeek and never affects the monthly allowance. The same work adds one DOCX reading module that returns a document's structure and ordered text. Tickets 06 and 07 use that module.

## Acceptance criteria

- [ ] A document of exactly 10,000 words is accepted, and a document of 10,001 words is rejected. The rejection states the limit and the document's word count.
- [ ] A document with tracked changes is rejected. The explanation tells the user to accept or reject the changes and upload again.
- [ ] A document with an unsupported structure is rejected. The explanation names the structure and says what to change.
- [ ] A password-protected or corrupt file is rejected with an explanation.
- [ ] A file that expands far beyond its upload size is rejected without exhausting API memory.
- [ ] A document that contains images, equations, or reference fields is accepted.
- [ ] A document in English or French with headings, paragraphs, lists, and tables is accepted.
- [ ] A rejected upload creates no sidebar entry, stores no file, and sends nothing to DeepSeek.
- [ ] The workspace shows the explanation beside the upload control, and the user can upload again immediately.
- [ ] The DOCX reading module returns headings, paragraphs, lists, and tables in document order, and marks images, equations, and reference fields as content that must not change.
- [ ] Fixture documents cover each rejection reason and each accepted structure, in English and French.
- [ ] The README lists the rejection rules.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes a screenshot of a rejection message.

- [ ] Footnotes, endnotes, comments, headers, and footers are preserved unchanged. Text boxes, content controls, and embedded objects are rejected for launch.
- [ ] Bold, italics, and hyperlinks are accepted and retained by the editor.
- [ ] The supported languages are English and French, including documents mixing those languages. Clearly unsupported-language documents are rejected with an explanation. Very short or uncertain text must not be presented as confidently classified.

## Blocked by

- 04: Upload a DOCX and download it privately
