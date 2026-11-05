# Revised DOCX verification

Checked on 2026-11-05 with the development API, worker, PostgreSQL, and private document volume.

| Check                  | Result                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| API tests              | 310 passed                                                                                         |
| Web tests              | 12 passed                                                                                          |
| Lint and type checks   | Passed                                                                                             |
| Real DeepSeek workflow | English, French, injection, and 10,000-word inputs completed with `deepseek-flash`                 |
| Maximum input          | 16 editing chunks completed; both downloads passed preservation and access checks                  |
| Private downloads      | Owner received both files; other users and admin received 404; signed-out requests received 401    |
| Failure publication    | Altered citations and late responses failed without a revised file in isolated PostgreSQL tests    |
| LibreOffice            | Version 26.8.2.2 opened and rendered the corrected original and revised English and French samples |
| Microsoft Word         | Owner confirmed the English and French real-worker revisions open correctly                        |

`english-original.docx` and `french-original.docx` are synthetic inputs. The corresponding `*-revised.docx` files use the deterministic faithful test provider. The `*-real-revised.docx` files came from the running worker and real DeepSeek requests. The `*-libreoffice.pdf` files render those real-worker outputs.

The image fixture's PNG checksum was corrected before the final Office checks. The originals and revisions retain identical image bytes. The provider now disables thinking mode so reasoning cannot exhaust the JSON response budget. Regression tests cover both fixes.

The completed screenshots show a real-provider result. The failure screenshots use a controlled citation-failure fixture. Browser checks verified distinct downloads, the review reminder, and absence of a revised download after failure. Temporary accounts, sessions, databases, and private files were removed.

These checks do not prove semantic equivalence. Owners still need to review revised prose and references before submitting a document.
