# Browser request pressure — 2026-09-30

## Goal
Stop the reported browser 429 flood without replaying writes or interrupting the
active grammar repair. Preserve the previously deployed corpus health overview.

## Inspected and changed
Inspected the pasted browser stacks, bridge, HTTP limiter, engine queue,
AnalysisSupport/useStudio and other timed editor requests, analysis notifications,
and production browser request aggregates. Changed `server/public/bridge.js`,
`server/http.cjs`, `src/components/AnalysisSupport.tsx`, browser/transport tests,
and current-state/log/this handoff plus the repair completion handoff.

SSE notifications previously scheduled reads every 100 ms without waiting for
prior reads; multiple editor components also share the serialized engine queue,
which rejects over eight pending calls per user. Refreshes now serialize with a
1.5-second throttle and trailing refresh, including navigation during a slow read.
Hosted invokes cap at three per tab and coalesce identical pending allowlisted
reads. A 429 delays queued requests according to Retry-After; ENGINE_BUSY uses
two seconds, general rate limits keep 60. Mutations remain distinct with no retry.

## Commands and results
- `node --test server/tests/bridge-pressure.test.cjs`: two tests pass (bursts,
  concurrency, cooldown and no write replay).
- Focused Playwright analysis tests: slow stream refresh and preserved summary
  history pass. `npm run build:app` passes (existing chunk-size warning).
- `git diff --check` passes.
- HTTP integration test could not start: COLLAB_TEST_DATABASE_URL is absent;
  it requires disposable PostgreSQL. No production database used for tests.
- Read-only authenticated production browser observed 11 engine requests over
  30 seconds after the job ended, no 429 or page errors. The original pasted
  trace has no response body, so its precise 429 code is not established.
- Exact repair record reached ready-for-review at 10:58:07Z, target matched,
  no failures and all 151 corpus rows unchanged. No new AI generation started.

## Remaining questions
Deployment and post-deploy browser verification pending. Multiple old tabs must
reload to adopt client backpressure; it cannot patch already loaded JavaScript.
Cross-tab concurrency remains subject to server limits, now with cooldown.

## Suggested next prompt
Check live browser request rates during ordinary contributor work and keep any
further diagnosis limited to request method/status aggregates.

Deployment preflight exposed an acknowledgment timestamp race: the drain check
compared against a timestamp sampled before writing the request. It now samples
the clock after reading the acknowledgment. The failed preflight did not touch
production. This also prevents rejecting valid fast acknowledgments in real use.
