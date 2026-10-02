# Repair completion and corpus health

## Goal

Prevent the five-minute cutoff from stranding grammar edits; recover the reported
coreferential-possessor repair and give contributors a quick whole-corpus overview.

## Investigation

Production job `job:6201489c-16b3-44f3-a425-92014f773a52` timed out at five minutes.
Its resume failed with the provider's 1,048,576-character limit: the checkpoint was
~1.1 MB. The saved final tool verification matched the intended expression and
checked 151 rows with zero changed lines, source changes or new reference issues.
No active jobs existed at inspection. Only this target's status/receipt metadata
and current-work counters were inspected; unrelated private records were not exported.

## Files inspected / changed

Agent runner, analysis input/service/store, Codex prompt assembly, grammar edit
journals/checks, MCP scope lifecycle, next-service and server queue/idle boundaries,
light rollout and focused tests. Added `electron/corpus-health.cjs`, its unit test,
`src/CorpusHealth.tsx` and browser tests; updated the top bar and dialog styles.

## Behavior

- Grammar repairs have no wall-clock job cutoff; ordinary analyses retain their
  timeout. Explicit cancellation and other budgets still apply. Repair MCP
  capabilities stay valid until closed, with active-attempt checks and revocation.
- Repair resume uses saved edit IDs/hashes and verification, not megabytes of old
  tool payloads. Full checkpoints and baselines stay in storage; the provider gets
  a compact baseline summary and exact submitted expression. No automatic retries.
- Provider failure/cancellation revokes new tool calls and drains in-flight work
  before final verification and writer release. Syntax/import or new corpus
  execution failures trigger hash-guarded rollback of that exact edit and a receipt.
  Changed linguistic output is reported, not automatically treated as an error.
- Health is read-only, no AI. It reopens the current engine and checks all source
  rows against references, with source counts, errors/divergences, unreviewed and
  pending counts, annotated surface/tag diversity and interrupted repair history.
  It reports active repair status instead of certifying an intermediate version.
  The morpheme count is observed annotated forms, not dictionary lemmas.
- Light deploy acquires a private idle lease, freezes new finite requests, drains
  active work, and checks lease freshness before replacing Studio. The first
  rollout onto an older server still honors that older server's idle window.
  Waiting for jobs may exceed a minute; no forced restart at the wait deadline.

## Commands / validation

- Focused agent/repair/analysis-input/MCP suites: 45 passed before adding the
  scope-lifetime regression. General analysis-service coverage previously passed.
- Five health/idle tests pass; six light rollout tests pass.
- Two browser tests pass at 800×600, including navigation to divergent rows and
  an active repair warning. Typecheck passes.
- The first socket-based run failed under sandbox EPERM; rerun with local socket
  permission passed. Fixed an expected fixture string length (1.6 MB, not 1.5 MB).
- Live deployment and resumed job outcome are recorded below after verification.

## What worked / limitations

Existing full durable receipts are preserved. No manual edit of the historical
job outcome, corpus, or source expression. Atomic replacement plus checked rollback
handles tool/verification failures; a host crash or disk failure can still need
journal recovery. This is not a general transactional filesystem implementation.
Pending draft trees are counted but are not all evaluated as historical source rows.

## Remaining questions / suggested next prompt

After rollout, open Saúde do corpus and inspect actual divergences. If a future
repair needs more than its step/output budget, assess that exact case; do not
silently replay paid provider attempts or broaden the grammar rule.

## Deployment and live health

`bee3ba1e2a38a81676cd2d3e06f45fa53d7a9d71` is live from the review branch.
The private drained-work lease was acknowledged before restart; rollout took
50.5 seconds. Checkpoint: `light-backups/20260930T104849-935fa0`.

The live authenticated browser check passes at 800×600, including readable dark
mode and all source table columns. Fresh check: 151 lines / 3 sources / zero
reference divergences / zero execution failures / 3 pending drafts / 312 distinct
annotated surface-tag forms. Runtime 2428 ms. Source counts: Araújo 111,
Bettendorff 40, Catecismo Brasílico 0 (two pending drafts). Historical interrupted
attempts remain visible separately. Screenshot: `.local/vps-qa/corpus-health-live.png`.
The extra MCP lifetime/revocation test also passes. Production build passes.

Only the reported job was explicitly resumed through the authenticated API,
operation `resume:verified-completion-20260930`, at 10:49:53Z. Instructions require
verification and completion of saved work without replaying edits or broadening
the rule. No passage/reference writes or automatic new analyses were permitted
by the live browser verification. Terminal outcome follows below.

### Terminal result

The resumed attempt finished ready-for-review at 10:58:07.935Z, after more than
eight minutes. The target matched and all 151 source lines were unchanged with
no failures. The continuation completed documentation without further grammar
rule edits. One documentation edit failed worker reload and was rolled back;
its retry succeeded and verification remained clean.
