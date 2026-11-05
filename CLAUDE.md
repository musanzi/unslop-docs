# Repository guidelines

## Agent skills

### Issue tracker

Track work in GitHub Issues at `musanzi/unslop-docs`.
Before reading or creating issues, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
Before triaging issues, read `docs/agents/triage-labels.md`.

### Domain docs

Use one root glossary and one shared ADR directory.
Before exploring a domain or proposing changes, read `docs/agents/domain.md`.

## Project structure

This pnpm and Nx monorepo is the starter for unslop-docs, a document-editing application for students. Read `docs/product-spec.md` before implementing product behavior. Use these directories:

- `apps/api/src/modules/`: NestJS feature modules with CQRS handlers, DTOs, and TypeORM entities. Put database migrations in `apps/api/src/modules/database/migrations/`.
- `apps/web/src/app/`: Angular portals organized into `domains/`, `core/`, and `shared/`. Keep state and data access separate from presentational UI.
- `apps/web/public/`: static assets. Put custom styles in `apps/web/src/styles/`.
- `libs/api-contracts/`: generated OpenAPI schema and types. Import types through `@unslop-docs/api-contracts`.

## Code style and naming

Use two-space indentation, single quotes, and semicolons. Prettier uses a 120-character print width and omits trailing commas. Follow ESLint and Angular template accessibility rules.

Use Tailwind utilities for component styling. Put shared tokens, fonts, Material overrides, and essential custom styles in `apps/web/src/styles/` and import them globally. Do not use component CSS or SCSS files or inline `styles` metadata.

Don't write comments in code. Give classes, methods, and functions clear names instead.

Use kebab-case filenames, PascalCase classes, and camelCase members. Follow neighboring modules and filenames, such as `create-stand.handler.ts`. Use kebab-case for Angular component selectors and camelCase for directive selectors.

For frontend implementation, use the angular-developer skill.

## API testing

- Run `pnpm test:api` after API behavior changes. The unit suite requires no environment file or running services.
- Run `pnpm test:api:watch` while editing, or `pnpm test:api --args=validate-credentials` to filter specs by path.
- Run `pnpm typecheck:api:tests` to check specs, fixtures, and runner configuration. `pnpm typecheck` also includes this check.
- Place `*.spec.ts` files beside the code under test and import Vitest functions explicitly. Use Nest testing modules for dependency-injected providers and call exported helpers directly.
- Test observable outcomes and consequential side effects, including effects that must not occur after failure. Mock infrastructure dependencies and keep business logic under test.
- Add regression tests for bug fixes. Skip construction-only tests and tests of methods that only forward a call. No numeric coverage threshold applies.

## Commits and pull requests

Use a Conventional Commit prefix, such as `feat:`, `fix:`, `refactor(web):`, or `docs:`. Follow it with a concise description. Commitlint enforces this format. The pre-commit hook runs lint.

In pull requests, describe the problem, the resulting behavior, and how you checked the changes. Link relevant issues. Include screenshots for visual changes.

## Running servers

The user keeps the development stack running in Docker with `compose.dev.yml`: web on port 4200 (`WEB_PORT`) and API on port 8000. Do not run `pnpm dev`, `pnpm dev:api`, `pnpm dev:web`, `nx serve`, or `docker compose up`, because a second copy of the stack can exhaust the machine's memory. To check behavior, send requests to the running servers with curl. If a server you need is down, ask the user to start it. To validate a change, run `pnpm lint`, `pnpm typecheck`, or `pnpm test:api` instead of a build.
