# unslop-docs

unslop-docs is a document-editing product for students. The planned first release accepts DOCX files in English or French, reports writing patterns in a writing assessment, edits the document, and returns a revised DOCX. A writing assessment does not establish AI authorship.

Google-only sign-in, profile management, admin user listing, CSV export, and account statistics are available. Document upload, assessment, editing, private downloads, monthly allowances, and status management are not implemented yet. The [product specification](docs/product-spec.md) describes the intended behavior, and the [ticket index](docs/ticket-drafts/README.md) links the implementation issues.

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

`DB_*` configures PostgreSQL. `REDIS_URL` supplies sessions and cache. `MAIL_*` configures SMTP, with `MAIL_FROM` as the sender. Mailpit uses port 1025 inside Compose and needs no credentials. `SESSION_MAX_AGE` sets the session lifetime in milliseconds. `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, and `GOOGLE_REDIRECT_URI` configure Google-only sign-in. `FRONTEND_URI` sets the browser origin for redirects and CORS.

`UPLOADS_DIR` holds public profile images. Compose overrides it with `/app/apps/api/uploads` and mounts `uploads_data` there. Do not store student documents there. Private document storage and the background worker are planned in separate issues.

`WEB_PORT` also sets the production SSR listener. `pm_id` is an optional process-manager marker used by the SSR entry point, and is not needed in Docker. `OPENAPI_INPUT` optionally selects an alternate schema for contract generation. `NODE_ENV=production` is set by the production Docker image for runtime dependencies. DeepSeek settings will be added when document processing is implemented.

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

Install the locked dependencies with `pnpm install --frozen-lockfile`. Tests run without a database, Redis, SMTP, or a private environment file. HTTP specs start an isolated test application on an ephemeral loopback port.

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

## Maintenance and deployment

- Follow [CLAUDE.md](CLAUDE.md). API modules use CQRS and expose their own queries and commands. Web code separates data access, features, interfaces, and presentational UI.
- After API changes, run `pnpm generate:api`. The command runs the API source in Nest preview mode, exports `libs/api-contracts/openapi.json` and generates the shared types. It does not need a running API, database, Redis, or SMTP server. The web app's build, serve, and typecheck targets also run these steps. Contract generation and type checks do not build either app. To use another schema, set `OPENAPI_INPUT` to a schema URL or a local JSON or YAML file.
- Import types from `@unslop-docs/api-contracts` and commit the OpenAPI document and generated types. Never edit generated files manually.
- Before you commit application changes, run `pnpm lint`, `pnpm typecheck`, and `pnpm test:api`. The owner manages builds and the development stack. Git hooks run linting and enforce Conventional Commit messages. GitHub Actions also runs builds.
- Set the web app's API URLs in `apps/web/src/environments`. The development URL is `http://localhost:8000`. The production value, `https://api.unslop-docs.com`, is a placeholder to replace with the owner's API origin before deployment. Before deployment, configure real secrets, Google OAuth, SMTP, `MAIL_FROM`, and `FRONTEND_URI`. Keep `.env` private. The production Compose file does not run Mailpit, so use an external SMTP service.

```sh
docker compose -f compose.prod.yml up -d --build
```

Apply migrations separately during deployment. Back up PostgreSQL and uploaded files before releases. Compose stores PostgreSQL data, Redis data, and uploads in named volumes. `down` preserves those volumes. `down -v` deletes them.
