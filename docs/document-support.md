# DOCX support reference

`readDocx(bytes)` in `apps/api/src/modules/documents/validate-docx.ts` is the shared reader for uploads, worker input, and revised-output validation. `validateDocx(bytes)` calls the same reader and discards the model. This reference describes what the reader accepts since issue #15 and what it still rejects.

## Accepted content

Ordinary Word content controls are normalized into their visible text or images. Inline, block, table-row, table-cell, and nested controls are unwrapped before the document model is built, so their text is read, counted, edited, and validated like any other paragraph text. The revised main part contains no `w:sdt` wrappers. Controls in headers, footers, footnotes, endnotes, and comments stay byte for byte in those preserved parts.

Tracked changes are read as their final version. Insertions, moved-to text, inserted rows, and co-authoring conflict insertions are kept. Deletions, moved-from text, deleted rows, and conflict deletions are dropped, so moved text appears once. Property-change history (`w:rPrChange`, `w:pPrChange`, `w:tblPrChange`, and similar), move range markers, and cell revision markers are removed. The revised DOCX contains no revision markup. The uploaded original is stored unchanged and remains downloadable, so users can recover the original controls and revision history.

Images, equations, simple and complex reference fields, footnote, endnote, and comment references, and text boxes are protected elements. The reader keeps their XML unchanged and reports them as unedited elements in the revision notices. Visible text inside fields and text boxes contributes to the document word count but is never sent for editing.

## Normalization details

Normalization rewrites the decoded main-part XML by removing exact character ranges that the parser recorded, then parses the result again with the same security limits. `readXmlPart(mainPart)` and `readPart(mainPart)` return that normalized main part; every other part is returned as uploaded. Source offsets in the model refer to the normalized main part.

Known limitations, accepted under [ADR 0004](adr/0004-allow-formatting-differences-in-revised-documents.md):

- A tracked deletion of a paragraph mark does not merge the two paragraphs; both paragraphs remain.
- A tracked cell deletion or merge keeps the cell; only its marker is removed.
- Headers, footers, notes, and comments keep any revision markup they contained, because those parts are preserved byte for byte. Word shows them with their tracked changes still pending.
- Data-bound controls lose their binding in the revised document because the wrapper is removed; the visible text is kept.
- Paragraph layout, pagination, and section properties are copied, not verified. The app does not claim exact pagination.

## Rejections that remain

The API still rejects these files before creating a record or writing private storage:

- Embedded OLE objects, imported content (`altChunk`), subdocuments, and relationships to such parts. Embedded objects are never executed.
- Password-protected files, legacy Word containers, damaged ZIP or XML content, DTDs, damaged fields or hyperlinks, cyclic styles, unmodeled body structures such as `w:customXml`, and archives that exceed the safety limits (10 MB upload, 2,048 entries, 50 MB expanded, 20 MB per entry, 10 MB per XML part, 200:1 ratio above 1 MB, 100,000 elements, 128 nesting levels).
- New uploads that render as more than five pages. This check runs after DOCX validation at the upload boundary, not in the shared reader. Covers, references, and blank pages count. Existing documents and longer revised downloads remain readable. See the [renderer reference](../services/renderer/README.md).
- Clearly unsupported-language prose. English, French, and documents mixing both are supported.

External entities are never resolved and linked resources are never fetched. Preserving an element does not bypass these checks: every XML part, including headers and notes, passes the same parser limits.

## Fixtures

[DOCX fixtures](../apps/api/src/shared/testing/fixtures/docx/README.md) include accepted content-control, header, tracked-change, and text-box files, the formerly rejected files that now succeed, and the regression files that must still fail. [docs/evidence/issue-15](evidence/issue-15/README.md) holds original and revised pairs with their notices.
