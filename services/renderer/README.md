# DOCX page rendering

The private renderer uses LibreOffice to convert a validated DOCX to PDF and `pdfinfo` to count its pages. New uploads may contain at most thirty rendered pages, including covers, references, and blank pages. The server's count is authoritative and may differ from Word because of fonts and layout. Saved DOCX page metadata does not determine acceptance. Revised downloads and existing documents do not pass through this upload check.

The API sends the original validated DOCX to `http://renderer:8091/pages`. The response contains the page count and SHA-256 of that exact input. API validation rejects mismatched hashes, invalid counts, and unavailable rendering before storing a document. A busy renderer returns a retryable upload error. It never substitutes a guessed count.

Compose publishes no renderer port. The renderer has only an internal network, a read-only root filesystem, a 256 MB temporary filesystem, a 768 MB memory limit, one CPU, and a process limit. It runs as an unprivileged user with capabilities dropped. Each conversion has a fresh profile with macros disabled, accepts one document at a time, and kills its process group after a bounded conversion. Temporary DOCX and PDF files are removed after every attempt. Request contents are not logged.

The image installs Liberation, DejaVu, and Noto fonts. A font absent from this set can change pagination. This service counts pages; it does not promise Word-identical formatting.

Run unit tests without LibreOffice:

```sh
python3 -m unittest discover -s services/renderer -v
```

Build and check real rendering:

```sh
docker build -t unslop-docx-renderer:test services/renderer
docker run --rm --network none --read-only --memory 768m --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:size=256m,mode=1777 -v "$PWD/services/renderer:/tests:ro" unslop-docx-renderer:test python /tests/smoke.py
```

The smoke check renders one-, thirty-, and thirty-one-page synthetic documents whose saved metadata falsely claims one page. CI runs this check. Deployment also verifies that the API page validator accepts thirty pages and rejects thirty-one, then checks assessment, editing, and final assessment with a synthetic document and the configured DeepSeek account.
