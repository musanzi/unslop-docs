# Unslopy

Unslopy edits DOCX files in English or French. Uploading runs a local AI detector. The user chooses a rewrite strength and clicks **Unslopify**. DeepSeek then edits with the pinned unslop skill, and the local detector checks the revised document. Detection needs no paid API or subscription. Its experimental model score does not prove authorship or match a university's detector. [Local detector setup and limitations](services/detector/README.md).

The app is live. This README describes the current code. Of the accepted [workflow revision](docs/document-workflow-design.md), the document support from issue #15 and the API lifecycle from issue #16 are implemented: ordinary content controls and tracked changes are accepted, passages that fail a content check keep their original text with a notice, formatting differences alone never block a download, uploads are assessed before any editing, Unslopify reserves one monthly slot and charges it only when the revised download is ready, and the revised document receives its own assessment. Deletion from issues #11 and #12 is implemented: the owner deletes a document in any state together with every file kept for it. Deleting a queued or processing document stops it: no later result is saved, an active rewrite reservation is released once, and the worker sends nothing further to DeepSeek for it. Text already sent to DeepSeek in a request still in flight may be processed there to completion; the worker aborts that request within its next heartbeat and discards any answer. The workspace from issue #13 is implemented: uploads show transferred bytes, each document shows its phase (queued, assessing, ready to unslopify, editing with progress from the API, checking the result, download ready, or failed with a phase-specific retry), an assessed document shows its local model score, a Light/Balanced/Thorough rewrite-strength slider (1–100, initially 50) and the **Unslopify** action, and a completed document shows the before and after scores, both downloads, revision notices, and a note when the final score is unavailable. The interface shows neither writing-pattern examples nor a document preview. Retry is available in the selected document panel, not the sidebar. A completion animation plays once when the user watches the document complete; `prefers-reduced-motion` removes all motion and keeps the same text.

The product name is Unslopy. Repository, package, database, and Compose identifiers use `unslop-docs`.

## Project structure

This TypeScript monorepo uses pnpm and Nx.

| Path                 | Purpose                                                           | Main technologies                                                        |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | HTTP API and the background worker, which has its own entry point | NestJS 12, CQRS, TypeORM, LangChain, LangGraph                           |
| `apps/web`           | Public pages, user workspace, and admin portal                    | Angular 22 with SSR, Angular Material, Tailwind CSS 4, NgRx Signal Store |
| `libs/api-contracts` | API types generated for the web app                               | OpenAPI, `openapi-typescript`                                            |

PostgreSQL 18 stores application data and the job queue. Redis 8 stores sessions and cache. Users sign in with Google only.

## Run the app locally

You need Docker, a Google OAuth web client, a DeepSeek API key, and enough memory for the local detector. Budget about 4 GB of RAM for that service and about 1.7 GB for its model weights. The first start downloads the pinned model before the worker becomes ready. Run all commands from the repository root.

1. Create your environment file. Never commit `.env`.

   ```sh
   cp -n .env.example .env
   ```

2. Set these values in `.env`. Generate `SESSION_SECRET` with `openssl rand -hex 32`. Choose a `DEEPSEEK_MODEL` that supports JSON output from the [DeepSeek model list](https://api-docs.deepseek.com/quick_start/pricing/).

   ```dotenv
   SESSION_SECRET=
   ADMIN_EMAIL=
   GOOGLE_CLIENT_ID=
   GOOGLE_SECRET=
   DEEPSEEK_API_KEY=
   DEEPSEEK_MODEL=
   ```

3. In your Google OAuth client, register `http://localhost:8000/auth/google/redirect` as a redirect URI. If the consent screen is in testing mode, add your Google account as a test user.

4. Start the stack, prepare the database, and watch for source changes.

   ```sh
   docker compose -f compose.dev.yml up -d --build
   docker compose -f compose.dev.yml exec api pnpm db:up
   docker compose -f compose.dev.yml exec api pnpm db:seed
   docker compose -f compose.dev.yml watch
   ```

| Service       | URL                                  |
| ------------- | ------------------------------------ |
| Web app       | <http://localhost:4200>              |
| API           | <http://localhost:8000>              |
| API docs      | <http://localhost:8000/docs>         |
| OpenAPI file  | <http://localhost:8000/openapi.json> |
| Mailpit inbox | <http://localhost:8025>              |

The first Google sign-in creates an account. The account whose verified Google email matches `ADMIN_EMAIL` gets admin access. The API refuses to start if `ADMIN_EMAIL` is blank, and the worker refuses to start if a DeepSeek setting is blank. `ASSESSMENT_TIMEOUT_MS` bounds an initial assessment and `PROCESSING_TIMEOUT_MS` bounds a rewrite including its final assessment; the [worker reference](docs/assessment-worker.md) describes both.

## Configuration

[`.env.example`](.env.example) lists every setting, with a comment for each group.

`UPLOADS_DIR` holds public profile images. `DOCUMENTS_DIR` holds private student documents. Keep these paths separate, because the API refuses to start if they overlap.

## Develop

To run commands on your host, install Node.js 24.15+ and the dependencies. The `packageManager` field in `package.json` pins pnpm.

```sh
corepack enable
pnpm install --frozen-lockfile
```

To run a command in Docker instead, prefix it with `docker compose -f compose.dev.yml exec api` or `docker compose -f compose.dev.yml exec web`.

| Command                       | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `pnpm lint`                   | Lint all projects                               |
| `pnpm typecheck`              | Check types in all projects, including specs    |
| `pnpm test:api`               | Run the API tests                               |
| `pnpm test:api:watch`         | Rerun the API tests while editing               |
| `pnpm test:api --args=google` | Run the API specs whose paths match the filter  |
| `pnpm test:web`               | Run the web tests                               |
| `pnpm db:up` / `pnpm db:down` | Apply migrations or revert the latest migration |
| `pnpm generate:api`           | Regenerate the API contracts                    |

The API tests need no running services and no `.env` file. `bash tools/check-allowance-postgres.sh [api-container]` copies `tools/check-allowance-postgres.cjs` into the running API container and runs the allowance and deletion races against a disposable PostgreSQL database, including deletion contending with publication of a revised document.

After you change the API, run `pnpm generate:api` and commit the OpenAPI document and the generated types. Import these types from `@unslop-docs/api-contracts`, and do not edit the generated files.

Before you commit, run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. Commit messages must follow Conventional Commits. [CLAUDE.md](CLAUDE.md) lists the code style and testing conventions.

## Deploy

A push to `main` runs the CI workflow. When CI succeeds, the Deploy workflow connects to the VPS over SSH and runs `tools/deploy.sh`. The script pulls `main`, rebuilds the stack from `compose.prod.yml` under the `unslopy` project name, and waits for the local detector to become healthy. It stops the API and worker, backs up PostgreSQL and private documents together under `~/unslop-backups`, and applies migrations before starting the updated services. It then checks `/health`. To redeploy without a push, use **Run workflow** in the Actions tab.

The Deploy workflow needs the `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` repository secrets. The server needs its own `.env` with real secrets and an external SMTP service, because production does not run Mailpit.

Before each release, back up PostgreSQL and the `documents_data` volume together. Document records and their files must stay in step. `docker compose down` keeps the named volumes, but `down -v` deletes them.

## More documentation

- [Product specification](docs/product-spec.md)
- [Glossary](GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Assessment worker reference](docs/assessment-worker.md)
- [DOCX support reference](docs/document-support.md)
- [Revised document reference](docs/document-revisions.md)
- [DOCX test fixtures](apps/api/src/shared/testing/fixtures/docx/README.md)
