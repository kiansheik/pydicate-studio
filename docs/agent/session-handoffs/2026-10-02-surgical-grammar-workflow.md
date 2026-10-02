# Surgical grammar workflow — local review handoff

## Goal and base

Make grammar corrections surgical, provide an early observable result and useful
live feedback, and investigate the reported cancellation-time 64 MiB error.
No linguistic rule is justified by the example alone. Initial scope prohibited
publication. After final local checks, the user explicitly approved pushing the
branch and opening a draft PR (parent transcript: “yeah”). No paid inference,
engine rule/corpus edit, production mutation, merge or deployment is authorized.
PR18 remains open at64632e2 on final upstream verification; publish this as a
stacked draft targeting refactor/server-only so review excludes the cleanup diff.

Read AGENTS.md and docs/agent/{index,current-state,repo-map,open-questions}. There
is no .agents directory in the original or selected base. Original checkout is
`unlocked-light-deploy` at `4d0a60c`, with numerous unrelated uncommitted storage/UI
changes; none were copied/edited. Read-only upstream `ls-remote` and `gh pr view18`
confirm PR18 is OPEN, unmerged, targeting unlocked-light-deploy, head
64632e21f6ad75a584570df92481b2fea643e9a2. Implemented on
`improve/surgical-grammar` in `/Users/kian/Documents/Codex/2026-10-02/task/grammar-workflow`.

## Verified findings and limits

- AnalysisStore.transact serializes, size-checks, fsyncs and atomically replaces
  an entire per-project file. Its write-limit error is exactly the reported
  “As análises excederam 64 MiB; os dados anteriores foram preservados.”
- Input baselines, replay receipts, visible tool-result events, provider tool
  events and checkpoints retain large/duplicated payloads. Grammar file reads
  return full bodies; browser details previously sent replay checkpoints/baselines
  and displayed complete bodies in the technical log.
- Cancel persisted before controller.abort. A size-limit failure could prevent
  abort; this is independently reproduced. A concurrent read also awaited and
  rethrew a failed pending write before loading prior state; readers now observe
  the last committed record after a rejected write (the writing caller still errors). It does not prove which payload filled
  the actual production record. The live file was not read or changed.
- Selected subtrees still requested assistant_context for their containing tree.
  Integrated diagnostic prompt asked reload_engine after every edit despite the
  strategy saying grammar_edit already verifies. Every Markdown note edit also
  triggered a full reload/target/context/corpus cycle.
- Parent's separate cloud-browser inspection reported a correction still labeled
  Analisando over23 minutes after start, no event for18 minutes, history switches
  of10–23 seconds, and a ready indicator attributable to an older conversation.
  These observations do not prove the provider still ran or identify payload size.
  A failed terminal-status save can leave a persisted run ownerless until restart
  under old code. Mac native Chrome inspection returned permissions-not-granted;
  the user later clarified the active session was in the cloud browser.

## Changes / semantics

- Narrow lexical context by default; includeContainingTree explicitly expands it.
  Shared-definition declaration namespace/pending insertion scope remain intact.
- Evaluate unchanged exact target first; emit a candidate with pending corpus
  status, then check parent/shared passage/corpus, marking verified or
  review-required. Full edit validation/rollback and final verification remain.
- “Esta forma está correta” records a durable candidate-hash-bound human
  observation with authenticated contributor attribution at the hosted boundary.
  It neither edits/approves a draft/source/reference nor stops/restarts inference.
  Changed draft/candidate/engine and cancelled/blocked attempts reject acceptance;
  replay cannot apply twice or overwrite subsequent edits.
- Markdown grammar guides keep exact replacement, file hash, scope and before-image
  journal; omit needless engine/corpus checks. Python rules/tests still check fully.
  Journal writes remain synchronous because they are recovery-critical. This is
  removal of expensive clerical validation, not an unsupervised note-writing job.
- Local stage timings exclude provider and progress-persistence time. Display
  elapsed/quiet intervals, deadline cleanup and queue target/date provenance;
  distinguish ready work in other conversations. Technical log displays a bounded
  projection; complete records remain on server.
- Owner deadline covers preparation and provider work (15 minutes in production).
  Expiry aborts new work but holds ownership while atomic edits/checks drain.
  Read reconciliation marks ownerless persisted running work blocked, with explicit
  resume, retaining partial response and never calling a provider automatically.
- Cancel aborts before metadata persistence even when the latter fails. Atomic
  grammar calls continue their required check/rollback. Persisted orphan work can
  subsequently reconcile; no fabricated successful cancellation receipt.

## Storage format / durability / retention

Legacy inline version1 records remain readable. On subsequent writes, payloads
at least16 KiB (inputs, event results/arguments, checkpoints/follow-up contexts,
operation results) are written once by SHA256 under records/payloads. A
payloadStorage version1 index records exact relative locations, hashes and bytes;
public/store APIs hydrate the same original objects, preserving input digests.
Blob fsync + atomic rename + directory sync precede atomic index replacement.
A failed index commit can leave an unreferenced blob, never lost prior history.
Missing/corrupt blobs error and preserve the index; ENOENT inside hydration cannot
be mistaken for a missing project. Hydration checks hash/size, limits per payload
64 MiB and aggregate references256 MiB/100,000 references; index stays capped64MiB.

No pruning or automatic GC is included. Replaced checkpoints can leave retained
unreferenced blobs, so disk usage can grow; review retention before any rollout.
Keep all blobs, including unreferenced ones, for recovery; storage retention is a later bounded task. Portable recovery
requires the entire records directory. Existing operational backup and legacy
archive capture recurse through this directory; tested directory-copy restore
and existing archive tests. Do not export/restore only the project JSON. Old
runtime code cannot read packed indexes and will preserve/error, so rollback
needs the pre-upgrade complete state backup or a reviewed unpacking migration.
Records already over the old64MiB read limit remain a separate explicit recovery
operation; normal old writes refused to create them.

## Measurements (fixture, no provider time)

A real-size representative72MiB repeated tool history serializes inline to
75,498,050 bytes and would be rejected by the old writer. New index is2,084 bytes,
with one exact6MiB blob shared across12 replay receipts. Last focused run:
old inline serialization71.0ms (then rejection), first durable new write72.0ms,
reopen14.5ms, metadata/history selection89.3ms. Another concurrent run showed
113.8/16.5/140.5ms; timings vary. No successful old >64MiB write or actual user
history-switch speedup is claimed. Deterministic engine-stage test: target40ms,
corpus3,000ms; target arrives before corpus begins, still explicitly provisional.
Markdown note edit adds zero reload/regression requests; final check remains.

## Files inspected / changed

Inspected runtime/{analysis-service,analysis-store,analysis-input,analysis-external,
agent-runner,grammar-repair,provider-codex,shared-authoring}, server/{ai,studio,http},
UI/domain analysis/grammar diagnostics and harnesses, scripts/collab/{host,
desktop_sync}, package/build/Playwright configuration and focused tests.
Changed runtime/{analysis-service,analysis-store,grammar-repair} and corresponding
repair/storage tests; server/ai and new ai-projection tests; AnalysisSupport,
analysis domain/tests, grammar-diagnostic domain/CSS, grammar browser tests/harness;
current state, log, map and this handoff. No generated corpus or neighbor edits.

## Commands / results

- `npm run build`, `npm run typecheck`, `npm run format:check`, `git diff --check` pass.
  Build retains the existing Vite large-chunk advisory.
- `npm test -- --run`:35 files,289 domain tests pass.
- `node --test --test-timeout=45000 runtime/tests/{grammar-repair,analysis-store,
  analysis-service,analysis-crash}.test.cjs server/tests/ai-projection.test.cjs`:
 81 pass,0 fail,0 skipped (79 runtime +2 hosted projection/authorization). Covers
 steering, timeout, cancellation, late results, idempotency, stale engine/draft,
 rollback, pending/shared scope, crash, exact payload migration/corruption, a
 prepared-blob failed-index boundary, portable copy/restore and early observations.
- PostgreSQL-backed full hosted suite not run: COLLAB_TEST_DATABASE_URL is not
 supplied. An initial broad command failed loading pg until existing local server
 dependencies were copied; it did not reach a live DB/provider. No configuration
 or credentials changed. Full runtime/Python suites beyond the targeted checks
 were not run; no Python/linguistic code changed.
- `python3 -B -m unittest scripts.collab.tests.test_desktop_sync -q`:9 archive tests pass.
- Playwright on a dedicated5317 instance:9 grammar/streaming tests passed (early
  confirmation, reload, repeated retry, steering, queued follow-up, rollback labels).
  Narrow pane starts hidden as existing responsive behavior; “Assistência IA” opens
  it, then the provisional result can be inspected with no horizontal overflow.
  Final narrow flow rerun passed. Screenshots visually inspected.
- Avoid the default5173 reuse in this session: another checkout's server already
  exists. `.local/grammar-playwright.config.ts` is an ignored local QA config based
  on the checked-in one, with dedicated port5317/reuseExistingServer:false.

## Deliverables / remaining questions / next prompt

Reviewable diff/patch and screenshots in .local/test-results. Commit/push/draft
publication is now authorized, with exact-head CI required before completion. Parent should review storage-format rollout implications,
run disposable PostgreSQL hosted integration, and (with separate authorization)
measure the affected live record and provider lifecycle read-only. Provider
linguistic quality/latency was not tested. First-submission baseline and full
Python-edit/final corpus validation remain on the mandatory path; no safety bypass.

Suggested next prompt: “Review the surgical grammar-workflow patch against64632e2,
run disposable hosted PostgreSQL integration, inspect the stalled live record
read-only, and decide whether to publish a draft PR. Do not deploy or make paid
provider calls without separate authorization.”
