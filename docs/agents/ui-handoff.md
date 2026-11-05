# UI redesign handoff

This session stops after the requested UI redesign and verification. Further issue implementation belongs to the other agents working from the GitHub tracker.

## Continue from main

The owner consolidated committed work onto `main` and retired `integration/unslop-docs-v1`. Use `main` as the shared integration target. The UI implementation commit is `de69b7815d4fc6c6a465deac43b12c2c66fbf8a9`; subsequent UI fixes and evidence are also on `main`.

The alternate issue #9 attempt was cancelled before integration and superseded by another agent's completed implementation. The consolidation agent archived that partial work. Continue from the current tracker state and `main`, rather than replaying the archived attempt.

## Preserve the UI contract

Follow the styling rules in [CLAUDE.md](../../CLAUDE.md). The web UI uses the shared Inter font, Tailwind utilities, and global styles. Shared controls are in `apps/web/src/styles/components/controls.css`; Material tokens and Lucide strokes are in the adjacent `material.css`.

`/` redirects to `/auth/sign-in`. Admin users open at `/admin/users/:id`, with status editing and history on that page. Profile editing uses the shared `ProfileDialog` service from both user and admin navigation. Legacy profile URLs redirect to their parent areas. The shared account control owns profile and logout actions.

The [verification record](../evidence/dashboard-redesign/README.md) links desktop and mobile evidence. Browser checks found and fixed missing Lucide strokes and hidden mobile details actions. The temporary test data and sessions have been removed.

The observed local development stack uses `compose.dev.yml` with project name `unslopy`. Verify the running container labels before testing, since the project name alone does not identify development or production. Keep new tests isolated from real accounts and documents.
