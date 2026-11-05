# Unslopy

Unslopy is a web app that makes DOCX files in English or French read more naturally. A user uploads a document, a background worker assesses and edits it with DeepSeek, and the user downloads a revised DOCX. A writing assessment reports writing patterns. It does not prove AI authorship.

The app is live. This README describes the current code. The accepted [workflow revision](docs/document-workflow-design.md) is not implemented yet.

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

You need Docker, a Google OAuth web client, and a DeepSeek API key. Run all commands from the repository root.

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

The first Google sign-in creates an account. The account whose verified Google email matches `ADMIN_EMAIL` gets admin access. The API refuses to start if `ADMIN_EMAIL` is blank, and the worker refuses to start if a DeepSeek setting is blank.

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
| `pnpm test:web`               | Run the web routing tests                       |
| `pnpm db:up` / `pnpm db:down` | Apply migrations or revert the latest migration |
| `pnpm generate:api`           | Regenerate the API contracts                    |

The API tests need no running services and no `.env` file.

After you change the API, run `pnpm generate:api` and commit the OpenAPI document and the generated types. Import these types from `@unslop-docs/api-contracts`, and do not edit the generated files.

Before you commit, run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. Commit messages must follow Conventional Commits. [CLAUDE.md](CLAUDE.md) lists the code style and testing conventions.

## Deploy

A push to `main` runs the CI workflow. When CI succeeds, the Deploy workflow connects to the VPS over SSH and runs `tools/deploy.sh`. The script pulls `main`, rebuilds the stack from `compose.prod.yml` under the `unslopy` project name, applies migrations, and waits for `/health` to respond. To redeploy without a push, use **Run workflow** in the Actions tab.

The Deploy workflow needs the `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` repository secrets. The server needs its own `.env` with real secrets and an external SMTP service, because production does not run Mailpit.

Before each release, back up PostgreSQL and the `documents_data` volume together. Document records and their files must stay in step. `docker compose down` keeps the named volumes, but `down -v` deletes them.

## More documentation

- [Product specification](docs/product-spec.md)
- [Glossary](GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Assessment worker reference](docs/assessment-worker.md)
- [Revised document reference](docs/document-revisions.md)
- [DOCX test fixtures](apps/api/src/shared/testing/fixtures/docx/README.md)
