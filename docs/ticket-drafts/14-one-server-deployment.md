# 14: Deploy the product on one server

## What to build

The owner deploys unslop-docs on one server with Docker, PostgreSQL, and Redis by following a guide. The API, the worker, and the web app run from production images. Documents persist in a private volume, separate from public uploads, as ADR 0002 requires.

## Acceptance criteria

- [ ] The production Compose file runs the API, the worker, the web app, PostgreSQL, and Redis, and restarts each service after a failure or a server reboot.
- [ ] The production image starts the worker and runs it as a non-root user.
- [ ] The private document volume is mounted in the API and the worker, and is not mounted in the web service. Both can write to it as non-root users.
- [ ] The public uploads volume stays separate, and no document path resolves through the public uploads route.
- [ ] `DEEPSEEK_API_KEY` reaches only the services that need it, and the web service does not receive it.
- [ ] The guide gives a migration command that works in the production setup. The production image today has no build tooling to run the existing migration command.
- [ ] Documents, records, and queued jobs survive recreating the containers.
- [ ] A deployment how-to covers the required settings, including `ADMIN_EMAIL`, the Google redirect URI, `DEEPSEEK_API_KEY`, and `REDIS_URL`. It also covers first start, migrations, upgrades, and which volumes to back up.
- [ ] The how-to states the one-server limit from ADR 0002.
- [ ] `docker compose -f compose.prod.yml config` succeeds with the example settings. `pnpm lint` and `pnpm typecheck` pass.
- [ ] The pull request gives the owner a smoke test to run: sign in, upload, process, download, recreate the containers, download again. Agents do not start the stack.

- [ ] Production is served behind an HTTPS reverse proxy. Document the public origin, Google callback, forwarded-protocol trust, and secure session-cookie settings. Provide domain placeholders rather than assuming a domain the owner has not configured.
- [ ] Preparing and testing production configuration does not authorize a public release with incomplete product tickets. The launch checklist includes every accepted first-release behavior.

## Blocked by

- 07: Unslop a document into a validated revised DOCX
