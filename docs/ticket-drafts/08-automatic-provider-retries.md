# 08: Retry temporary provider errors automatically

## What to build

When DeepSeek has a temporary problem, the system tries again by itself, up to two times after the initial attempt. The user sees the document still processing and does not need to act. If the third attempt fails, or the error is not temporary, the document fails.

## Acceptance criteria

- [ ] Timeouts, network errors, rate limiting, and provider server errors count as temporary.
- [ ] A temporary error triggers up to two automatic retries after the initial attempt, with a delay between attempts. A fake provider that fails three times receives exactly three calls, and the document ends as failed.
- [ ] A fake provider that fails twice and then succeeds receives three calls, and the document proceeds normally with one saved result.
- [ ] An error that is not temporary, such as a rejected API key or a malformed request, gets one call and no retry.
- [ ] The document stays in processing during retries, and the entry does not show a failure until the final attempt fails.
- [ ] Automatic retries reuse the document's existing job and create no new charge or reservation.
- [ ] A worker restart between attempts does not grant extra retries.
- [ ] The README states the retry rule.
- [ ] Specs cover each case above with a fake provider and no real delay.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test:api` pass.

- [ ] The two automatic retries apply per failed DeepSeek request, including each chunk. Successful chunks are not sent again solely because a later chunk failed. The persisted document deadline bounds the entire attempt.

## Blocked by

- 06: Produce a writing assessment in a background worker
