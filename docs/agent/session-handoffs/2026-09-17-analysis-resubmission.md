# Analysis resubmission

## Goal

Fix submitting the preserved passage still displaying the old code-mode error after the transport repair.

## Files inspected

Required agent docs; actual saved analysis jobs (read-only); `AnalysisSupport.tsx` submission/localStorage logic; domain analysis types; backend submit idempotency; browser harness and workspace tests.

## Files changed

`src/components/AnalysisSupport.tsx`, `tests/next-hook-harness.tsx`, `tests/analysis-workspace.spec.ts`, current state/log and this handoff.

## What worked

Saved records contained only the two original jobs, with no new attempt: this was replay of the old result, not another provider failure. The localStorage operation ID was keyed permanently to input. A matching terminal job now adds its identity to the next deliberate submission key. An active request does not advance the key; busy-state and backend command idempotency remain in force. Applies to batch items too; earlier saved keys need no destructive migration.

The browser harness now actually returns the previously committed job for a repeated operation ID and rejects different arguments for that ID, like the real service. The new regression leaves the first request in needs-input with the exact historical error, resubmits unchanged source/revision to create a second job, then repeats during running status and confirms there are still only two jobs.

## Commands run

- `npm run build`: typecheck and production build pass; existing bundle-size advisory only.
- `npx playwright test tests/analysis-workspace.spec.ts --grep 'unchanged passage' --output /tmp/studio-resubmit-browser --reporter=line`:1 passed.
- `npx playwright test tests/analysis-workspace.spec.ts --output /tmp/studio-resubmit-suite --reporter=line`:11 passed in13.4s; results in `/tmp/studio-resubmit-tests.log`. Test server exited and port5173 was verified free afterward.
- Focused Prettier and `git diff --check`: pass.

## What failed

Previous browser fixtures always created a new job regardless of operation ID, hiding the mismatch between visible submit behavior and the real backend. No additional paid attempt was made by the user's observed clicks; the old response was being returned.

## Remaining questions

No live-provider request was made during this repair. Reload the updated UI/restart the desktop command before deliberate resubmission. Old history stays visible as history; a new submission creates its own result. No user drafts, saved requests, corpus, commit or push changed.

## Suggested next prompt

Submit the preserved passage using the updated UI and inspect the new job's progress. Report any new tool error separately from the retained historical response.
