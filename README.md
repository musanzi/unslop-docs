# Unslopy

Unslopy is a document-editing product for clearer, more natural writing. The planned first release accepts DOCX files in English or French, reports writing patterns in a writing assessment, edits the document, and returns a revised DOCX. A writing assessment does not establish AI authorship.

Google-only sign-in, profile management, private DOCX uploads and original downloads, admin user listing, status management with audit history, CSV export, and account statistics are available. Background writing assessment, editing, validated revised downloads, automatic provider retries, and monthly allowance reservations are available. The [product specification](docs/product-spec.md) describes the intended behavior, and the [ticket index](docs/ticket-drafts/README.md) links the implementation issues.

The product brand is Unslopy. Repository, package, database, and Compose identifiers remain `unslop-docs`.

## Stack and structure

This TypeScript monorepo uses pnpm and Nx to manage three projects:

| Path                 | Responsibility                                  | Main technologies                                                        |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | Authentication, business logic, and data access | NestJS 12, CQRS, TypeORM, PostgreSQL 18, Redis 8                         |
| `apps/web`           | Public pages, accounts, and administration      | Angular 22 with SSR, Angular Material, Tailwind CSS 4, NgRx Signal Store |
| `libs/api-contracts` | Generated API types consumed by the web app     | OpenAPI, `openapi-typescript`                                            |

Authentication uses Google-only sign-in and Redis-backed sessions. The API sends email through SMTP and uses Scalar for API documentation.

## Getting started

The owner runs the development environment with Docker Compose. Do not start another copy of the app servers while that stack is running. To run the apps on your host, install Node.js 24.15+ and pnpm 12.11.2. The `package.json` file pins the pnpm version. Run commands from the repository root.

```sh
cp -n .env.example .env
```

The example targets Compose service names: `db`, `redis`, and `mailpit`. Set these private values before starting the stack. Generate `SESSION_SECRET` with `openssl rand -hex 32`, and use that output in `.env`. Never commit `.env`.

```dotenv
SESSION_SECRET=replace-with-a-random-secret
ADMIN_EMAIL=your-verified-google-email@example.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_SECRET=your-google-client-secret
```

Create a Google OAuth web client and register the exact `GOOGLE_REDIRECT_URI` in `.env.example`, `http://localhost:8000/auth/google/redirect`. Replace the example values with real credentials, and add your Google account as a test user if the consent screen is in testing mode. Local interactive sign-in uses Google OAuth. Leave SMTP credentials empty for Mailpit.

Set `ADMIN_EMAIL` to the verified Google email of the administrator. The API refuses to start if this setting is missing or blank. Email matching ignores letter case. After changing `ADMIN_EMAIL`, restart the API to load the new setting. The previous admin loses access on their next request, including requests from an existing session. The admin portal refreshes authorization when you enter it or navigate between its pages.

```sh
docker compose -f compose.dev.yml up -d --build
docker compose -f compose.dev.yml exec api pnpm db:up
docker compose -f compose.dev.yml exec api pnpm db:seed
docker compose -f compose.dev.yml watch
```

Open the [web app](http://localhost:4200), [API docs](http://localhost:8000/docs), or [Mailpit inbox](http://localhost:8025). The API runs at `http://localhost:8000` and exposes its schema at `/openapi.json`.

The seed creates only the `user` role. Accounts are created on the first Google sign-in, with that role. Google subjects identify accounts; editable roles never grant admin access. Profile edits change the display name and avatar, while Google controls the email address.

The Google-only migration deletes stored password hashes and removes legacy role assignments. Existing accounts remain in the database, but cannot authenticate without a Google identity. The application never links accounts by email. A Google sign-in with a legacy email creates a separate account. Existing sessions must sign in again. Back up the database before applying the migration: the deleted credentials cannot be recovered by a rollback.

Password endpoints and admin account creation, CSV import, deletion, and role mutations return 404. User listing and CSV export remain available to the configured admin. Status management is implemented separately in issue #3.

### Manage user statuses

After applying the migrations, sign in with the configured admin account and open **Users**. Choose **View details** to open `/admin/users/:id`, select FREE, PREMIUM, or GOLD, then choose **Save status**. The detail page updates without a reload, and its URL supports direct links. The history shows the previous and new statuses, the admin email at the time of the change, and the date, newest first. The browser displays dates in your local time.

The `UserStatuses1793880100000` migration gives every existing user FREE and creates the status history table. New Google accounts start with FREE. Profile edits and later Google sign-ins preserve the assigned status. Initial FREE assignments do not create history records.

Each change locks the user's database row and commits the status and history record in one transaction. Submitting the current status writes no record. A failed audit write rolls back the status update. Reverting this migration removes all statuses and their history. Status changes apply to the next allowance reservation immediately without resetting usage.

The API exposes these endpoints:

| Endpoint                                                 | Response                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PATCH /users/:id/status` with `{ "status": "PREMIUM" }` | Updated user, including status. Requires admin access.                                                                                     |
| `GET /users/:id/status-changes`                          | Records with `id`, `userId`, `adminId`, `adminEmail`, `createdAt`, `previousStatus`, and `newStatus`, newest first. Requires admin access. |
| `GET /users/by-id/:id`                                   | User details for a direct admin link. Requires admin access.                                                                               |
| `GET /auth/me`                                           | Current profile, including status. Requires sign-in.                                                                                       |

The two status endpoints return 403 for non-admins and 404 for an unknown user. Invalid status values return 400. The API derives the acting admin from the authenticated session.

To verify the UI on the owner's stack, apply the migration, change a user's status, and reopen their history. Confirm that the list and detail page show the saved status, then sign in again as that user. Capture the status control and history for issue #3. Automated HTTP specs cover authorization, audit contents, no-op submissions, history order, rollback, and persistence, including concurrent profile and sign-in writes. PostgreSQL migration execution and browser screenshots require the running stack.

### Edit your profile

In either portal, choose your account at the bottom of the sidebar to open **Edit profile**. Name changes apply after **Save changes**. **Cancel** discards the name draft. Photo changes save immediately. Escape closes the dialog when no save is running, and focus returns to the account control. Old `/user/profile` and `/admin/profile` links redirect to documents and the admin overview.

All web interface text uses the bundled Inter font. Shared controls and dark Material overrides live in `apps/web/src/styles/`; component layout uses Tailwind utilities.

### Upload and download documents

`/` redirects to `/auth/sign-in`. Signed-in users continue to `/user/documents`, including when they visit sign-in directly. Google sign-in opens `/user/documents`. Choose **Upload DOCX** after reading the DeepSeek privacy notice. The workspace lists your originals, newest first, with 20 entries per page. On phones, **Open documents** opens the history drawer. Choose an entry, then **Download original**. Assessment and editing start automatically after a valid upload reserves a monthly allowance slot. Completed entries offer **Download revised DOCX**. Deletion controls remain a later issue. Uploads already enforce the processing eligibility rules below.

The `PrivateDocuments1793880200000` migration adds document ownership, display filename, byte size, upload time, and a generated original storage key. No document relation is added to user responses or CSV exports. Admin access does not grant access to another user's documents. The original has its own download endpoint and remains separate from future revised files.

| Endpoint                                  | Result                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /documents`, multipart field `file` | Upload metadata: `id`, `filename`, `size`, and `createdAt`.                              |
| `GET /documents?page=1&pageSize=20`       | Owner-only `items`, `total`, `page`, and `pageSize`. Page size is limited to 50.         |
| `GET /documents/:id/original`             | Original DOCX bytes, with an attachment filename and `Cache-Control: private, no-store`. |

Signed-out requests return 401. Download requests from another user or the admin return the same 404 as an unknown document. Invalid pagination or DOCX content returns 400. Uploads over 10 MB return 413. Metadata responses also disable caching. Stored names never contain the supplied filename, and no static route serves the private directory.

The upload limit is exactly 10,000,000 bytes. The API checks content rather than trusting the extension or MIME type. `yauzl` reads ZIP entries lazily without extracting files. `saxes` parses namespace-aware XML without resolving external entities. Validation checks DOCX content types, the main relationship, document XML, entry lengths, and CRC checksums. Archives with encrypted entries, duplicate or unsafe paths, DTDs, malformed XML, or more than 2,048 entries are rejected. Expanded data is limited to 50 MB total, 20 MB per entry, and 10 MB per XML part, with XML nesting limited to 128 levels. The reader also limits XML to 100,000 elements and style inheritance to 128 levels. Above 1 MB of expanded data, compression ratios over 200:1 are rejected per entry and for the archive as a whole. These are parser safety limits.

#### DOCX rejection rules

Uploads must contain no more than 10,000 words in the main document body. The reader joins text across runs before counting Unicode word segments with `Intl.Segmenter`. It counts headings, paragraphs, list items, table cells, and displayed field results. It excludes field instructions, equation markup, and the protected text in notes, comments, headers, and footers. Exactly 10,000 words is accepted. A rejection reports both the actual count and the limit.

The API rejects these files before creating a record or writing private storage:

- Tracked insertions, deletions, moves, or formatting changes, including changes inside protected parts. Accept or reject all tracked changes in Word before uploading again.
- Text boxes, content controls, and embedded objects. Convert them to ordinary paragraphs or images.
- Imported content, subdocuments, or body structures the reader cannot represent. Convert them to supported document content.
- Password-protected files, legacy Word containers, damaged ZIP or XML content, damaged fields or hyperlinks, and archives that exceed the safety limits. Remove passwords and save a new DOCX in Word. Reduce large images if needed.
- Clearly unsupported-language prose. English, French, and documents mixing both are supported.

Language screening runs locally and sends no text to a provider. It uses script proportions and conservative function-word signals for English, French, Spanish, German, Portuguese, Italian, and Dutch. It requires substantial evidence before rejecting text. Short or uncertain text remains unclassified and is accepted; acceptance is not a language-confidence claim. Language settings in the file do not override its text.

Images, equations, and reference fields are accepted as protected content. Footnotes, endnotes, comments, headers, footers, styles, numbering, relationship targets, and media retain their original bytes. Bold, italic, and hyperlink information remains available in the reader model. The worker creates and validates revised output using these protections. See the [revision reference](docs/document-revisions.md) for the checks and their limits.

Rejections return HTTP 400 with an actionable message beside **Upload DOCX**. The upload control becomes available immediately, including for selecting the same file again. Rejected uploads add no history entry, make no provider request, and use no allowance. Rejected uploads never reach the worker. A valid upload must reserve a slot before it enters the queue.

#### Shared DOCX reader

`readDocx(bytes)` in `apps/api/src/modules/documents/validate-docx.ts` is the shared reader for uploads, worker input, and revised-output validation. `validateDocx(bytes)` calls that same reader and discards the model. Both reject with a `BadRequestException` suitable for the upload response. Neither performs persistence, network requests, or allowance changes.

The returned `DocxDocument` and its nested arrays and objects are frozen. Its properties are defined in `docx-model.ts`:

| Property                          | Meaning                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocks`                          | Headings, paragraphs, list items, protected blocks, and tables in source order. Table rows contain cells, which contain ordered blocks, including nested tables.                         |
| `text`, `wordCount`               | Main-body text in reading order, separated by newlines between blocks and table cells, and its word count.                                                                               |
| `language`                        | Supported language signals, or `uncertain` with no claimed language.                                                                                                                     |
| Run `bold`, `italic`, `hyperlink` | Formatting from paragraph and character styles plus direct run properties, and the original hyperlink target or internal anchor. Original style XML remains protected.                   |
| Run `textNodes`                   | Editable text nodes, their exact source locations, and the parser-derived `contentStart` offset. Tabs, line breaks, run properties, and surrounding markup stay outside these locations. |
| `source`                          | Part name and half-open UTF-16 string offsets into `readXmlPart(part)`, after decoding and removing any byte-order mark. These are not byte offsets.                                     |
| Protected `reason`                | Why the content must remain unchanged, such as `image`, `equation`, `reference-field`, or a note reference.                                                                              |
| `protectedParts`                  | Every package part except the main document, with original size and SHA-256 digest.                                                                                                      |
| `readPart(name)`                  | A fresh copy of the original part bytes, or `undefined`. Changing that copy cannot change the reader's stored original.                                                                  |
| `readXmlPart(name)`               | The original decoded XML string, or `undefined`.                                                                                                                                         |

A complex field can span runs or paragraphs. The reader protects every paragraph that touches such a field, including adjacent prose in that paragraph. A run containing an image or another protected element is protected as a whole. Simple fields retain their own protected range. Downstream editing must replace only exposed `textNodes`, preserve all other main-part markup and all protected parts, and validate the output. The reader does not authorize reconstructing the document from plain text.

The assessment and editing workflow calls this reader on a stored original and passes only the needed text to DeepSeek. The model's part accessors stay local to the worker. The worker uses LangChain for DeepSeek calls and LangGraph for assessment, editing, construction, and validation. This reader requires neither dependency.

[DOCX fixtures](apps/api/src/shared/testing/fixtures/docx/README.md) include downloadable accepted and rejected files, their generator, and the screenshot procedure for the integration stack.

Uploads write and sync the original before committing its metadata. A failed write or database insert removes the private file when possible and publishes no document. Once a transaction reaches its commit phase, a connection failure can leave its outcome uncertain. The API retains the private file in that case because a delayed commit could still publish its metadata. An immediate empty lookup would not prove that the transaction rolled back. An unreferenced file has no download route. Failed cleanup and interrupted uploads can leave unreferenced files in the private volume; do not delete them until database recovery confirms that no document references them. Errors never log document text. A failed or interrupted upload can have completed, so refresh the history before retrying.

Reverting the migration removes metadata but leaves files in the volume. Restore the database and volume together to recover access. Container restarts preserve the named volume.

Automated HTTP tests cover ownership, admin denial, signed-out requests, pagination, public route isolation, safe filenames, byte-for-byte original downloads, malformed archives, the exact size boundary, and failure cleanup. Filesystem tests cover storage reinitialization, permissions, and symlink isolation. Live PostgreSQL migration execution and container restart verification remain owner-run checks. Capture empty and populated workspaces at desktop and phone widths from a stack running this revision; a different checkout cannot provide valid UI evidence. The original-after-editing check becomes runnable when editing exists.

### Monthly allowance rules

FREE allows 3 documents per UTC calendar month, PREMIUM allows 15, and GOLD allows 35. The workspace shows successful documents used, active reservations, and remaining slots. `GET /documents/allowance` reads the signed-in user's current status and usage with private, no-store caching.

A validated upload reserves one slot and commits it with the queued document. The API locks the owner row before checking usage, using the same row that admin status changes lock. It reads the reservation time after obtaining that lock. Concurrent uploads cannot take the same last slot. At the limit, the API returns HTTP 409 with the allowance and UTC reset time. It saves no file or runnable job for that rejection.

The reservation belongs to the UTC month in which it starts. At 00:00 UTC on the first day, usage for the new month starts at zero without a reset job. Prior-month reservations can finish without taking another slot. Success charges their original month. A status change does not reset usage. Reserved jobs can finish after a downgrade, while new jobs remain blocked if current usage meets or exceeds the new limit. An upgrade makes additional slots available immediately.

Assessment alone does not charge usage. Only publication of a validated revised DOCX converts an active reservation into one charge. Completion and charging commit together. Repeated completion cannot charge twice. Failure, deadline recovery, and deletion of an active document release its reservation. Automatic provider retries keep the same reservation. Workers refuse unreserved jobs and check the reservation before each provider request.

Deleting a completed document does not restore usage. Accounting retains the owner, reservation timestamp, month, and charge state. It stores no filename, storage key, or document text. Deletion removes the document reference from the charge.

`MonthlyAllowance1793880600000` creates the accounting table. For an upgrade, it marks pre-existing queued and processing documents as interrupted, preserving their originals. These jobs have no historical reservations and cannot safely dispatch. Existing completed documents remain downloadable and receive no invented reservation month or retroactive charge. The first allowance month therefore counts only reservations created after this migration. Rollback fails active work and removes all allowance accounting; restoring a backup is required to recover those charges.

Deploy the allowance migration and matching API and worker versions together. Old API versions create unreserved jobs, which the new worker refuses. Old workers do not perform terminal accounting. The isolated verification command does not deploy migrations to the live app database or restart services.

Run the real PostgreSQL acceptance check against an existing API container:

```sh
bash tools/check-allowance-postgres.sh unslopy-api-1
```

The check copies source into a temporary directory in that container, creates a random test database, applies migrations there, and uses fake DeepSeek responses. It proves the last-slot race with two blocked PostgreSQL connections in each of ten rounds, then checks month boundaries, publication, deletion, status changes, and reservation uniqueness. It removes the test database and copied files on exit. The database role must have permission to create a database. No application services start or restart. See the [issue #9 verification record](docs/evidence/issue-9/verification.md) for results and workspace screenshots.

### Run background writing assessments

Set `DEEPSEEK_API_KEY` and an explicit `DEEPSEEK_MODEL` in your private environment. Select a model with JSON output support from [DeepSeek's official model list](https://api-docs.deepseek.com/quick_start/pricing/). The worker fails startup with a setting name if either value is blank. Compose passes these settings only to the worker.

The owner must rebuild and recreate the API, web, and new worker containers to pick up the dependencies and environment wiring. Apply `DocumentAssessment1793880300000` before starting the worker. This implementation does not restart the owner's stack. The API's development command continues to invoke Nest directly, and the worker uses its own Nest entry point.

Valid uploads automatically enter the durable PostgreSQL queue. The HTTP upload returns after storage and database commit, before assessment. The worker reads the original, runs LangChain DeepSeek through a LangGraph workflow, and publishes validated writing patterns. The workspace refreshes its sidebar and selected assessment without a reload. A failed assessment keeps the original downloadable and shows a fixed explanation. Existing uploads stay original-only until uploaded again.

A queued job survives container restarts. Timeouts, network failures, rate limits, and provider server errors receive up to two automatic retries per request, including each editing chunk. Retries wait at least one second, then two seconds, and keep the document processing. A third failure, permanent error, or invalid output fails the document. LangChain and SDK retries remain disabled.

Retries reuse the same document and processing attempt, with no new reservation or charge. Request counts and validated results survive worker restarts, so completed requests are reused. A crash during a request with an unknown outcome fails after lease expiry. The original persisted deadline, 15 minutes by default, bounds all calls and delays. Automatic retries retain their original allowance reservation. User-requested retries remain #10.

Apply `ProviderRetries1793880500000` before deploying the updated worker. Stop old workers during the deployment: their recovery code treats delayed work as failed. Follow the [automatic retry acceptance guide](docs/provider-retry-acceptance.md) for isolated restart and migration checks.

See the [worker reference](docs/assessment-worker.md) for lifecycle and privacy rules and the [assessment acceptance guide](docs/assessment-acceptance.md) for fake-provider smoke tests and remaining live evidence. Production Compose also defines a separate worker using the API image and its `worker.js` entry point. Full production hardening remains #14.

### Verify Google sign-in locally

1. Apply the migrations, then open **Sign in** and choose **Continue with Google**.
2. Cancel Google consent. Confirm that the sign-in page explains the cancellation.
3. Sign in with a verified account that differs from `ADMIN_EMAIL`. Confirm that the admin portal is unavailable and `/users` returns 403.
4. Sign in with the configured admin account. Confirm that the user list opens.
5. Change `ADMIN_EMAIL` and restart the API. Confirm that the previous admin's existing session loses admin access.
6. Sign out. Confirm that the old session can no longer request `/auth/me`.

Automated specs use fake Google transport, repositories, and isolated in-memory sessions. They do not add an application login bypass. Real consent, Redis persistence, and migration execution require the owner's running stack. Production deployments need HTTPS, secure session cookies, and reverse-proxy settings before launch.

### Running on the host

Use this alternative only when the Docker app servers are stopped. Run PostgreSQL and Redis locally, and provide an SMTP server. Configure the database through the `DB_*` variables in `.env`. Set `DB_HOST=localhost` and `REDIS_URL=redis://localhost:6379`. Set `MAIL_HOST` and `MAIL_PORT` to your SMTP server's host and port. The supplied Compose files do not publish PostgreSQL, Redis, or SMTP ports to the host. Mailpit exposes only its web inbox on port 8025.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:seed
pnpm dev
```

## Configuration reference

[`.env.example`](.env.example) lists every application setting. `API_PORT=8000` and `WEB_PORT=4200` match the development URLs. Angular's development server uses port 4200. If you change it, also set its `serve.options.port` in `apps/web/project.json`, update `FRONTEND_URI`, and update the Google client configuration. If you change the API port, update `GOOGLE_REDIRECT_URI` and the development API URL in `apps/web/src/environments/environment.development.ts`.

`DB_*` configures PostgreSQL. `REDIS_URL` supplies sessions and cache. `MAIL_*` configures SMTP, with `MAIL_FROM` as the sender. For existing installations, change the display name in `MAIL_FROM` to `Unslopy Support` and retain the configured email address. Mailpit uses port 1025 inside Compose and needs no credentials. `SESSION_MAX_AGE` sets the session lifetime in milliseconds. `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, and `GOOGLE_REDIRECT_URI` configure Google-only sign-in. `FRONTEND_URI` sets the browser origin for redirects and CORS.

`UPLOADS_DIR` holds public profile images. Compose overrides it with `/app/apps/api/uploads` and mounts `uploads_data` there. Do not store student documents there. `DOCUMENTS_DIR` holds private originals and validated revised documents. It defaults to `private-documents`, relative to the API working directory. Both Compose files override it with `/app/private-documents` and mount the separate `documents_data` volume. The web container does not mount this volume. The API rejects overlapping public and private storage paths, including symlink aliases. The production image prepares the private directory for its `node` user. The worker mounts the same private volume with write access for validated revised output. Both downloads require the document owner. See the [revision acceptance guide](docs/revision-acceptance.md) for fixture generation and runtime checks.

`WEB_PORT` also sets the production SSR listener. `pm_id` is an optional process-manager marker used by the SSR entry point, and is not needed in Docker. `OPENAPI_INPUT` optionally selects an alternate schema for contract generation. `NODE_ENV=production` is set by the production Docker image for runtime dependencies. `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` are required only by the worker. `PROCESSING_TIMEOUT_MS` defaults to 900000, and `DEEPSEEK_TIMEOUT_MS` defaults to 60000.

## Everyday commands

| Command                                           | Purpose                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                                        | Start both development servers                  |
| `pnpm dev:api` / `pnpm dev:web`                   | Start one development server                    |
| `pnpm build`                                      | Build both apps into `dist/apps`                |
| `pnpm lint`                                       | Lint both apps and type-check shared contracts  |
| `pnpm start:api` / `WEB_PORT=4200 pnpm start:web` | Run existing production builds                  |
| `pnpm db:up` / `pnpm db:down`                     | Apply migrations or revert the latest migration |
| `pnpm db:seed`                                    | Ensure the user role exists                     |
| `pnpm generate:api`                               | Regenerate contracts from the API source        |
| `pnpm sync:api`                                   | Regenerate contracts and build the web app      |

`pnpm typecheck` checks both apps and shared contracts. To run a pnpm command in Docker, prefix it with `docker compose -f compose.dev.yml exec api` or `docker compose -f compose.dev.yml exec web`. Database commands build the API first.

## API unit tests

Install the locked dependencies with `pnpm install --frozen-lockfile`. Tests run without external database, Redis, SMTP, or provider services and without a private environment file. Queue tests use embedded PostgreSQL. HTTP specs start an isolated test application on an ephemeral loopback port.

| Command                        | Purpose                                |
| ------------------------------ | -------------------------------------- |
| `pnpm test` or `pnpm test:api` | Run the API unit suite once            |
| `pnpm test:api:watch`          | Rerun tests while editing              |
| `pnpm test:api --args=google`  | Run specs whose paths match the filter |
| `pnpm typecheck:api:tests`     | Check test, fixture, and runner types  |

After API behavior changes, run `pnpm test:api` and `pnpm typecheck:api:tests`.
`pnpm typecheck` also checks API specs. CI runs lint, type checks, unit tests, and builds.

Place `*.spec.ts` files beside the API code under test and import Vitest functions explicitly.
Use Nest testing modules for dependency-injected providers and call exported helpers directly.
Mock infrastructure dependencies, such as repositories, mail, and filesystem operations. Keep business logic under test.

Test observable business decisions, transformations, errors, and consequential side effects.
Check that rejected operations do not write data, publish events, or delete files.
Add regression tests for bug fixes. Skip construction-only tests and straightforward forwarding.
There is no numeric coverage threshold.

## Web routing tests

Run `pnpm test:web` to check root and fallback navigation, authentication guards, and Google callback error parameters. These tests use Angular's router with isolated page fixtures. `pnpm typecheck` also checks web test types.

## Maintenance and deployment

- Follow [CLAUDE.md](CLAUDE.md). API modules use CQRS and expose their own queries and commands. Web code separates data access, features, interfaces, and presentational UI.
- After API changes, run `pnpm generate:api`. The command runs the API source in Nest preview mode, exports `libs/api-contracts/openapi.json` and generates the shared types. It does not need a running API, database, Redis, or SMTP server. The web app's build, serve, and typecheck targets also run these steps. Contract generation and type checks do not build either app. To use another schema, set `OPENAPI_INPUT` to a schema URL or a local JSON or YAML file.
- Import types from `@unslop-docs/api-contracts` and commit the OpenAPI document and generated types. Never edit generated files manually.
- Before you commit application changes, run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. The owner manages builds and the development stack. Git hooks run linting and enforce Conventional Commit messages. GitHub Actions also runs builds.
- Set the web app's API URLs in `apps/web/src/environments`. The development URL is `http://localhost:8000`. The production value, `https://api.unslop-docs.com`, is a placeholder to replace with the owner's API origin before deployment. Before deployment, configure real secrets, Google OAuth, SMTP, `MAIL_FROM`, and `FRONTEND_URI`. Keep `.env` private. The production Compose file does not run Mailpit, so use an external SMTP service.

```sh
docker compose -f compose.prod.yml up -d --build
```

Apply migrations separately during deployment. Back up PostgreSQL and uploaded files before releases. Compose stores PostgreSQL data, Redis data, public uploads, and private documents in separate named volumes. Back up `documents_data` together with PostgreSQL. If you move a volume between development and production, give the production `node` user ownership of the private directory and its files before starting the API. `down` preserves those volumes. `down -v` deletes them.
