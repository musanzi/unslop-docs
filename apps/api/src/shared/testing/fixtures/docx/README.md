# DOCX upload fixtures

These synthetic documents contain no student data. The accepted structure fixtures use WordprocessingML packages with styles, numbering, relationships, media, notes, comments, headers, and footers. They are suitable for upload checks. The rejection fixtures deliberately contain unsupported or damaged content.

| Files                                                                                                         | Expected result                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `english-structures.docx`, `french-structures.docx`, `mixed-structures.docx`                                  | Accepted. Headings, paragraphs, numbered lists, tables, bold and italic runs, hyperlinks, an image, an equation, a reference field, and protected ancillary parts.            |
| `short-uncertain.docx`                                                                                        | Accepted without a confident language classification.                                                                                                                         |
| `exactly-10000-words.docx`                                                                                    | Accepted at the word limit.                                                                                                                                                   |
| `over-10000-words.docx`                                                                                       | Rejected with a count of 10,001 and a limit of 10,000.                                                                                                                        |
| `tracked-changes.docx`                                                                                        | Rejected with instructions to accept or reject tracked changes.                                                                                                               |
| `text-box.docx`, `content-control.docx`, `embedded-object.docx`                                               | Rejected with the unsupported structure named.                                                                                                                                |
| `unsupported-spanish.docx`, `unsupported-german.docx`, `unsupported-russian.docx`, `unsupported-chinese.docx` | Rejected with the supported languages stated.                                                                                                                                 |
| `encrypted-zip.docx`, `encrypted-office-signature.docx`                                                       | Rejected with password-removal guidance. These test an encryption flag and an Office compound-file signature, respectively. They are not complete encrypted Office documents. |
| `corrupt.docx`                                                                                                | Rejected as damaged.                                                                                                                                                          |
| `zip-bomb.docx`                                                                                               | Rejected before expanding a 20,000,001-byte entry.                                                                                                                            |

Regenerate all 18 files from the repository root:

```sh
node tools/generate-docx-fixtures.cjs
```

The generator uses `docx-fixture-catalog.ts`, `docx-reader-fixture.ts`, and `docx-language-fixtures.ts`. ZIP timestamps are fixed. The reader specs load the committed files and verify their outcomes. Additional generated cases exercise corrupt CRCs, traversal, XML nesting and node limits, compressed expansion, formatting changes, mixed text runs, UTF-16, CDATA, nested tables, complex fields, and preserved-byte isolation.

To capture rejection evidence on the integration stack:

1. Integrate the issue #5 commit and let the parent's running stack update.
2. Sign in with Google or use the parent's isolated test session setup.
3. Open `/user/documents` and upload `tracked-changes.docx`.
4. Capture the explanation beside the enabled **Upload DOCX** control. Confirm that history contains no new entry.
5. Upload `english-structures.docx` immediately and confirm that its original can be downloaded.

The implementation worktree does not control the parent's containers. Its automated HTTP tests use isolated identities and temporary directories. Browser screenshot evidence must come from a stack running this revision.
