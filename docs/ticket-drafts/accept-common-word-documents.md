# Accept common Word documents and tolerate formatting differences

## What to build

Ordinary Word content controls currently trigger a blanket rejection before upload. Removing that check alone leaves the document reader unable to traverse some controls. Support their visible contents throughout import, editing, and export, and deliver usable DOCX files without requiring exact formatting preservation.

This follows the accepted workflow revision and supersedes the relevant rejection and strict-formatting criteria in closed issues #5 and #7. Security, length, language, and readable-file checks remain.

## Acceptance criteria

- [ ] Normalize ordinary inline, block, table-cell, and nested content controls into visible text or images. Handle controls in preserved document parts without blanket rejection. Both validation and traversal accept the result.
- [ ] Use the final version of tracked changes: include insertions and exclude deletions, including moved content without duplication. Keep the uploaded original unchanged and downloadable.
- [ ] Preserve safe complex elements, images, equations, fields, notes, headers, footers, and comments where practical. Identify elements left unedited. A limitation in layout or editing support alone does not reject the file.
- [ ] Retain 10 MB, 10,000 normalized main-body words, and English/French limits. Text in controls and tables counts toward the word limit. Preserve archive expansion, encrypted-file, malformed XML, and other security checks.
- [ ] Never execute embedded objects, resolve external entities, or fetch external linked resources. Unsafe or unreadable files receive a specific error. Preserving an element does not bypass security checks.
- [ ] Match original styles and structure as closely as practical. Formatting differences alone do not fail the revision. Do not impose original run boundaries when a safe passage-level rewrite can preserve content.
- [ ] If a rewritten passage fails quotation, citation, number, or reference checks, keep that original passage and continue the rest. Return notices tied to affected passages. Do not replace text with incomplete provider output or drop material silently.
- [ ] Return a readable DOCX and separate original download. Do not claim exact pagination or proven semantic equivalence.
- [ ] Tests cover English/French content controls, nested controls, controls in headers, tracked insertions/deletions/moves, protected content fallback, and a formerly rejected file that now succeeds. Security and word-limit regression fixtures still fail appropriately.
- [ ] Update fixture documentation and the README's implemented behavior. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. Include representative original and revised DOCX files without private user data as review evidence.
