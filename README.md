# Unslopy

Unslopy edits English and French DOCX files for students. Users sign in with Google, upload a document, and review a local AI detector's score. They choose a rewrite strength and click **Unslopify** to edit with DeepSeek. The app checks the revised document and offers both versions for download.

Editing reserves one monthly allowance slot and charges it when the revised download is ready. The detector's score is experimental and does not prove authorship. See the [detector setup and limitations](services/detector/README.md).

The product name is Unslopy. Code, database, and Compose identifiers use `unslop-docs`.

## Run locally

Use Docker with Compose, a Google OAuth web client, and a DeepSeek API key. Allow about 4 GB of RAM for the detector and 1.7 GB for its model weights, in addition to the rest of the stack. Run these commands from the repository root.

1. Create the environment file. Keep `.env` out of version control.

   ```sh
   cp -n .env.example .env
   ```

2. Set `SESSION_SECRET`, `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, `DEEPSEEK_API_KEY`, and `DEEPSEEK_MODEL` in `.env`. Generate the session secret with:

   ```sh
   openssl rand -hex 32
   ```

   Choose a DeepSeek model that supports JSON output. Keep the other development defaults in [`.env.example`](.env.example).

3. Register `http://localhost:8000/auth/google/redirect` as a redirect URI in your Google OAuth client. If the consent screen is in testing mode, add your Google account as a test user.

4. Start the stack. The first start downloads the detector model before the worker becomes ready.

   ```sh
   docker compose -f compose.dev.yml up -d --build
   ```

5. Apply database migrations, then seed the database.

   ```sh
   docker compose -f compose.dev.yml exec api pnpm db:up
   docker compose -f compose.dev.yml exec api pnpm db:seed
   ```

6. Start source synchronization and leave this command running while you develop.

   ```sh
   docker compose -f compose.dev.yml watch
   ```

Open the [web app](http://localhost:4200) and sign in with Google. The first sign-in creates your account. The account whose verified email matches `ADMIN_EMAIL` gets admin access.

Use the [API reference](http://localhost:8000/docs) to inspect endpoints and [Mailpit](http://localhost:8025) to read local email. The API runs at `http://localhost:8000` and exposes its schema at `/openapi.json`.

If startup fails, check the service logs:

```sh
docker compose -f compose.dev.yml logs --tail 100 api worker detector
```

Check that `ADMIN_EMAIL` and both DeepSeek settings are set. Keep `UPLOADS_DIR` for public profile images separate from `DOCUMENTS_DIR` for private documents. The API rejects overlapping paths.

## Find the code to change

Use these entry points in the pnpm and Nx monorepo:

- [apps/web/src/app](apps/web/src/app) contains the Angular app with server-side rendering. Start in `domains/user/modules/documents` for the workspace or `domains/admin` for user management. Keep state and data access separate from UI components.
- [apps/api/src/modules](apps/api/src/modules) contains NestJS modules, CQRS handlers, and TypeORM entities. Start in `documents` for uploads, assessments, rewrites, downloads, and deletion.
- [apps/api/src/worker.ts](apps/api/src/worker.ts) starts the background worker. PostgreSQL stores document jobs and application data. Redis stores sessions and cache.
- [services/detector](services/detector) contains the Python detector service. Detection runs locally. Rewriting sends document text to DeepSeek using the pinned skill in [vendor/cursor-pstack-unslop](vendor/cursor-pstack-unslop).
- [libs/api-contracts](libs/api-contracts) contains the generated OpenAPI schema and TypeScript types shared with the web app.
- [apps/api/src/modules/database/migrations](apps/api/src/modules/database/migrations) contains database migrations.

Read [CLAUDE.md](CLAUDE.md) for code conventions and the [architecture decisions](docs/adr/) before changing document processing or storage.

## Check your changes

For host commands, use Node.js 24.15 or later within the 24.x release line. Use the pnpm version pinned in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
```

Keep the development stack in Docker. Avoid starting a second copy with `pnpm dev`.

Before committing, run:

```sh
pnpm lint
pnpm typecheck
pnpm test:api
```

The API tests need no running services or `.env`. To filter API tests by path, use `pnpm test:api --args=google`.

For web changes, run `pnpm test:web`. For detector changes, run `python3 -m unittest discover -s services/detector -v`.

After changing the API contract, regenerate it:

```sh
pnpm generate:api
```

Commit the generated schema and types. Import types from `@unslop-docs/api-contracts` instead of editing generated files.

Use Conventional Commit messages, such as `docs: clarify local setup`. The pre-commit hook runs lint, and commitlint checks the message.

## Deploy

Push to `main` to run CI. After CI passes, the [Deploy workflow](.github/workflows/deploy.yml) runs [tools/deploy.sh](tools/deploy.sh) on the VPS over SSH.

Configure the `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` repository secrets. Keep the checkout at `~/unslop-docs` on the VPS, with a production `.env` and an external SMTP service.

The script rebuilds [compose.prod.yml](compose.prod.yml), stops the API and worker, and backs up PostgreSQL and private documents together under `~/unslop-backups`. It applies migrations, starts the updated services, and checks `/health`.

To redeploy, select **Run workflow** in the Deploy workflow. Preserve the database and document backups together. Avoid `docker compose down -v`, which deletes named volumes.

## Read the detailed docs

Choose the reference for the behavior you need to change:

- [Document support](docs/document-support.md) covers accepted DOCX content and validation limits.
- [Document revisions](docs/document-revisions.md) covers editing, preserved content, and revision notices.
- [Assessment worker](docs/assessment-worker.md) covers job states, deadlines, and retries.
- [DOCX test fixtures](apps/api/src/shared/testing/fixtures/docx/README.md) describes the sample documents used in tests.
- [Product specification](docs/product-spec.md), [workflow revision](docs/document-workflow-design.md), and [glossary](GLOSSARY.md) provide product context. Some descriptions predate the current detector. Use the [detector reference](services/detector/README.md) for current scoring behavior.
