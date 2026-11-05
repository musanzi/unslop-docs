# 02: Present unslop-docs as a student product with an English interface

## What to build

A visitor sees unslop-docs as a document-editing product for students, not as an application starter. Every message the product shows is in English, including API errors and emails. A new developer can set up the project from the README and the environment example without guessing.

## Acceptance criteria

- [ ] The landing page says what unslop-docs does for students. It covers DOCX upload, the writing assessment, editing, and download. No starter wording remains.
- [ ] Landing copy calls the report a writing assessment. It never claims to detect AI or to measure AI authorship.
- [ ] Page titles, meta descriptions, and social tags use the product name and description.
- [ ] Starter content that no page uses, such as the sustainable development goal data and its images, is gone.
- [ ] All interface text is in English. This covers portal navigation, skip links, admin labels, and statistics labels.
- [ ] All API error messages and emails are in English. Specs that assert the old wording are updated.
- [ ] The README describes the product and its architecture instead of a starter.
- [ ] The environment example lists every setting the application reads, including `REDIS_URL`. Its ports match the documented development stack.
- [ ] The README names the mail service the Compose file actually runs.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.
- [ ] The pull request includes screenshots of the landing page and one admin page.

## Blocked by

None (can start immediately).
