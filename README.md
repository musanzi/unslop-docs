# unslop-docs

unslop-docs is an Angular and NestJS starter with public pages, authentication, and profile management. Its administration dashboard manages users and roles and displays statistics. The apps share API types and run in Docker for development and production.

## Stack and structure

This TypeScript monorepo uses pnpm and Nx to manage three projects:

| Path                 | Responsibility                                  | Main technologies                                                        |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | Authentication, business logic, and data access | NestJS 12, CQRS, TypeORM, PostgreSQL 18, Redis 8                         |
| `apps/web`           | Public pages, accounts, and administration      | Angular 22 with SSR, Angular Material, Tailwind CSS 4, NgRx Signal Store |
| `libs/api-contracts` | Generated API types consumed by the web app     | OpenAPI, `openapi-typescript`                                            |

Authentication uses JWT, Redis-backed sessions, and Google sign-in. The API sends email through SMTP and uses Scalar for API documentation.

## Getting started

Use Docker Compose to run the development environment. To run the apps on your host, install Node.js 24.15+ and pnpm 12.11.2. The `package.json` file pins the pnpm version. Run commands from the repository root.

```sh
cp -n .env.example .env
```

Keep the database credentials from `.env.example`. Add or update these values in `.env`. The example omits `REDIS_URL`.

```dotenv
API_PORT=8000
WEB_PORT=4200
DB_HOST=db
REDIS_URL=redis://redis:6379
MAIL_HOST=mailhog
MAIL_PORT=1025
SESSION_SECRET=local-session-secret
SESSION_MAX_AGE=86400000
JWT_SECRET=local-jwt-secret
GOOGLE_CLIENT_ID=development-client
GOOGLE_SECRET=development-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/redirect
FRONTEND_URI=http://localhost:4200
```

The Google OAuth placeholders let the API start locally. To use Google sign-in, replace them with real credentials. Leave SMTP credentials empty for MailHog.

```sh
docker compose -f compose.dev.yml up -d --build
docker compose -f compose.dev.yml exec api pnpm db:up
docker compose -f compose.dev.yml exec api pnpm db:seed
docker compose -f compose.dev.yml watch
```

Open the [web app](http://localhost:4200), [API docs](http://localhost:8000/docs), or [MailHog inbox](http://localhost:8025). The API runs at `http://localhost:8000` and exposes its schema at `/openapi.json`.

The seed creates two accounts:

| Email             | Password    |
| ----------------- | ----------- |
| `admin@admin.com` | `admin1234` |
| `user@user.com`   | `user1234`  |

Run the seed only with development data. Each run resets these accounts' passwords and roles.

### Running on the host

Run PostgreSQL and Redis locally, and provide an SMTP server. Configure the database through the `DB_*` variables in `.env`. Set `DB_HOST=localhost` and `REDIS_URL=redis://localhost:6379`. Set `MAIL_HOST` and `MAIL_PORT` to your SMTP server's host and port. The supplied Compose files do not publish PostgreSQL or Redis ports to the host.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:seed
pnpm dev
```

## Everyday commands

| Command                                           | Purpose                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                                        | Start both development servers                  |
| `pnpm dev:api` / `pnpm dev:web`                   | Start one development server                    |
| `pnpm build`                                      | Build both apps into `dist/apps`                |
| `pnpm lint`                                       | Lint both apps and type-check shared contracts  |
| `pnpm start:api` / `WEB_PORT=4200 pnpm start:web` | Run existing production builds                  |
| `pnpm db:up` / `pnpm db:down`                     | Apply migrations or revert the latest migration |
| `pnpm db:seed`                                    | Create or reset development accounts            |
| `pnpm generate:api`                               | Regenerate contracts from the API source        |
| `pnpm sync:api`                                   | Regenerate contracts and build the web app      |

`pnpm typecheck` checks both apps and shared contracts. To run a pnpm command in Docker, prefix it with `docker compose -f compose.dev.yml exec api` or `docker compose -f compose.dev.yml exec web`. Database commands build the API first.

## API unit tests

Install the locked dependencies with `pnpm install --frozen-lockfile`. Tests run without a database, Redis, SMTP, an HTTP server, or a private environment file.

| Command                                     | Purpose                                |
| ------------------------------------------- | -------------------------------------- |
| `pnpm test` or `pnpm test:api`              | Run the API unit suite once            |
| `pnpm test:api:watch`                       | Rerun tests while editing              |
| `pnpm test:api --args=validate-credentials` | Run specs whose paths match the filter |
| `pnpm typecheck:api:tests`                  | Check test, fixture, and runner types  |

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

- Follow [AGENTS.md](AGENTS.md). API modules use CQRS and expose their own queries and commands. Web code separates data access, features, interfaces, and presentational UI.
- After API changes, run `pnpm generate:api`. The command builds the API, exports `libs/api-contracts/openapi.json` in Nest preview mode, and generates the shared types. It does not need a running API, database, Redis, or SMTP server. The web app's build, serve, and typecheck targets also run these steps. To use another schema, set `OPENAPI_INPUT` to a schema URL or a local JSON or YAML file.
- Import types from `@unslop-docs/api-contracts` and commit the OpenAPI document and generated types. Never edit generated files manually.
- Before you commit application changes, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Git hooks run linting and enforce Conventional Commit messages. GitHub Actions runs the same four checks.
- When you adapt the starter, update its branding. Set the web app's API URLs in `apps/web/src/environments`. The production configuration uses `https://api.unslop-docs.com`. Before deployment, configure real secrets, Google OAuth, SMTP, `MAIL_FROM`, and `FRONTEND_URI`. Keep `.env` private.

```sh
docker compose -f compose.prod.yml up -d --build
```

Apply migrations separately during deployment. Back up PostgreSQL and uploaded files before releases. Compose stores PostgreSQL data, Redis data, and uploads in named volumes. `down` preserves those volumes. `down -v` deletes them.
