# Content-control and tracked-change revision evidence

Generated on 2026-11-05 with `node tools/generate-revision-fixtures.cjs docs/evidence/issue-15`. Every input is synthetic and contains no student data. The `*-revised.docx` files come from the deterministic faithful test provider, which replaces "In order to" with "To" and "Dans le but de" with "Pour". `notices.json` records the notices the workflow returned for each pair.

| Pair                            | What it shows                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `english-content-controls`      | Inline, block, nested, row-level, and cell-level content controls edited as visible text. The revised main part contains no `w:sdt` wrappers.                                 |
| `french-content-controls`       | The same structures in French.                                                                                                                                                |
| `header-content-controls`       | A control in the header and a tracked insertion in a footnote stay byte for byte while the body is edited.                                                                    |
| `tracked-changes-final-version` | Tracked insertions, deletions, moves, property changes, and a deleted table row. The revised file holds the final version with no revision markup.                            |
| `text-box`                      | A text box preserved unedited and reported as an unedited `text-box` element.                                                                                                 |
| `kept-passage`                  | The provider changed a citation year in the first paragraph. That passage keeps its original text, the second paragraph is edited, and `notices.json` names the kept passage. |
| `english`, `french`             | The structure corpus from issue #7, which reports its unedited images, equations, fields, notes, and comments.                                                                |
| `injection`, `maximum`          | The injection and 10,000-word cases from issue #7, unchanged in behavior.                                                                                                     |

Each original stays available for download unchanged; the revised files were validated by the same reader that validates uploads. These files do not prove exact pagination or semantic equivalence. Owners review the revised document before using it.
