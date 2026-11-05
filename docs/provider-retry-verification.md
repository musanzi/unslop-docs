# Provider retry verification

Verified on 2026-11-05 after stopping the old worker and applying `ProviderRetries1793880500000` to the development database. A private database backup preceded the migration.

Lint, type checks, and all 330 API tests passed on the implementation commit. The following live checks used the production worker and queue code with fake providers in a disposable PostgreSQL database and private directory.

- Three temporary assessment failures produced exactly three calls and terminal failure across fresh worker processes.
- Two temporary failures followed by success produced three calls and one completed revision.
- A future retry time prevented an early call. Tests advanced the stored due time before subsequent attempts.
- Attempt identity, start time, and the original deadline stayed unchanged across retries.
- A later chunk retried twice while the assessment and earlier successful chunks were reused.
- A permanent rejection made one call. An expired deadline prevented another call.
- Two workers competing for one due retry made one provider call and published one result.
- A killed process with an unknown in-flight outcome failed after controlled lease expiration without repeating the request.
- Migration rollback and reapplication failed the active retry safely and retained completed revised metadata.

A separate synthetic upload passed through the running API and worker with real `deepseek-flash` calls. Its assessment and editing checkpoints each recorded one successful call. Both private downloads and output preservation passed, and API responses omitted checkpoint data.

The disposable database, private files, test accounts, and sessions were removed. No deployed fake-provider switch or authentication bypass was added. The [acceptance guide](provider-retry-acceptance.md) describes how to repeat the isolated checks.
