# Live grammar repair steering — 2026-10-01

## Goal

A message sent during correction must redirect the existing agent rather than
wait for another full inference. Preserve ongoing edits, regression checks and
all instructions with truthful delivery feedback.

## Files inspected and changed

Inspected analysis-service/store, agent-runner, provider-codex/RPC, hosted AI
routing, AnalysisSupport, analysis domain/submission helpers, protocol docs,
existing grammar/provider/browser tests and light deployment scripts.
Changed analysis-service, provider-codex, server/ai, AnalysisSupport, analysis
job type, associated backend/hosted/browser tests and the simulated UI harness.
Updated current state, log and this handoff. No neighboring grammar/corpus edits.

## Implementation

- `analysis_steer` saves text and conversation turn atomically with an idempotent
  operation receipt; active Codex repair only, matching project/passage.
- The running provider registers its existing RPC connection after turn/start.
  Native `turn/steer` includes expectedTurnId. No interruption or second turn.
- Delivery runs outside the tool event queue. Startup instructions wait for that
  connection; acknowledged delivery, uncertain transport failure and a closed
  turn remain distinct. Uncertain sends are never automatically replayed.
- Original input/digest remain immutable. Explicit resumed attempts retain all
  steering receipts; restart marks unsent/ambiguous instructions honestly.
- UI sends to the running repair in the selected conversation, clears the saved
  composer after successful capture, displays receipts after refresh and keeps
  running replies visible even for legacy queued follow-ups.
- Intentional follow-ups after completion get current ancestor summaries,
  verified edit receipts and checks at dispatch, excluding future queued turns.

## Commands and results

- Agent runner and grammar repair suites: 63 checks passed; an additional
  completion-before-delivery case plus focused steering/context checks follow.
- Analysis service/crash suites: 31 checks passed.
- Hosted AI authorization: two checks passed in a disposable local PostgreSQL
  cluster on port55449; it was stopped afterward.
- Chromium `tests/analysis-streaming.spec.ts`: five passed, including same-job
  steering, cleared composer, full response and refresh persistence.
- `npm run typecheck`, `npx vite build`, `git diff --check`: passed; existing
  Vite chunk-size advisory only. No paid provider requests were made for tests.

## What failed and was fixed

A preliminary queued-context test compared undefined fields against JSON-persisted
input; fixed its snapshot normalization. The browser fixture initially expected a
queued detail fetch despite its synthetic timestamp; corrected that assertion.
Steering initially left composer text saved; now it explicitly clears after
capture. A needless final state write changed completed ordinary-job timestamps;
limited cleanup to actual steering. Initial hosted tests lacked a database URL;
reran successfully against the disposable local database.

## Production observation and rollout

Original passage120 job6662c0b4 completed at12:59:26UTC. Legacy queued follow-up
f0ef824e began automatically under the previous release; no job was cancelled,
replayed or manually modified. Latest observed check matched with healthy corpus.
Deploy must let that existing writer finish. This release cannot retrofit a live
RPC handle into the old running process.

Disk preflight found1.2GB free. Removed six verified-unused old Studio images
(f7fe580,3aee95d,9764cd4,865d7ad,374232e,d9f75a8), retaining current and multiple
recent rollback images; recovered3.8GB. No volumes, research, backups or accounts
were removed. Rollout and parity verification are recorded below when complete.

## Remaining questions / suggested next prompt

Native steering is currently Codex-only. Provider acknowledgement means accepted
input, not proof that the resulting linguistic generalization is correct; every
repair still runs the existing corpus checks. The next real correction should
confirm that a changed instruction affects its subsequent work. Tests exercised
native protocol fixtures without spending inference usage.
