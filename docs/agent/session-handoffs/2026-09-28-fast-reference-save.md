# Faster reference save

## Goal

Translate the ground-truth action to Portuguese and eliminate the reported long
wait while preserving explicit human approval, drafts, references and source.

## Files inspected

App/useStudio and reference dialogs; server runtime, bridge, audit and tests;
Python publication snapshots, authoring service/runtime, declaration isolation,
repository fingerprints and existing publication/approval tests. Read only the
latest 24 matching production operation timing rows, without research content.

## Files changed

- Frontend reference labels/messages; relevant browser, smoke and hosted selectors;
  README wording. Main action: **Salvar como referência**.
- `python/publication_regression.py`: context reuse within a fresh snapshot.
- `python/rendered_structures.py`: clone helper defaults alongside globals so
  reused contexts cannot leak mutations into later passages. Nested container
  helpers retain isolation, shared identity and container cycles as well.
- `python/authoring_service.py`: exact-fingerprint baseline cache; one approval child.
- `python/authoring_runtime.py`: retain full and independent canonical approval
  evaluations inside that child, including a final freshness check before writes.
- New snapshot and approval Python tests; existing partial/sink test adaptations.
- `server/studio.cjs`, `useStudio.ts`: fingerprinted events and matching-response
  refresh suppression; authoring-sync regression.
- `server/tests/reference-publication.test.cjs`, hosted CI: actual compiled save,
  real SSE before responses, no redundant reload, unrelated research preserved.
- Agent current state/log/handoff.

## Commands and results

- Production audit: source_new_preview 19.266 s, source_apply 0.686 s,
  reference_approve 2.108 s. Audit measures execution, not queue/network wait.
- Disposable same-VPS benchmark, original 147-passage corpus and read-only selected
  grammar: before preview 18.021 s, warm 17.922 s, apply 0.593 s, approve 1.975 s;
  staged patch preview 3.061 s, warm 1.736 s, apply 0.655 s, approve 1.386 s.
  Both runs mutate only temporary corpus/state. Original live research untouched.
- All 145 local passage surfaces, annotations and failures match an independent
  snapshot oracle using the old fresh namespace per passage strategy. A read-only
  server run also confirms all 147 current production passages match that oracle.
- 22 snapshot/search/publication portability and real apply/recovery/stale tests pass.
- 23 focused/real approval and passage-order tests pass.
- Final combined snapshot/parity, rendered structure, approval and partial-output
  suite: all 43 passed, including the nested-container isolation regressions.
- 31 publication/authoring-sync browser tests pass; 22 label/review browser tests pass.
- Real compiled hosted save test passes (13.24 s including fixture setup), with
  zero redundant refresh requests, real source/reference output and unchanged
  unrelated source, draft/version and lexicon.
- `npm run build:app`, all 251 domain tests, formatting and diff checks pass.
- General hosted suite: 65 passed, 8 conditional browser/real-project tests skipped.
  The new compiled hosted publication test was run separately and passed.

## What failed

Sandbox initially blocked the test Vite listener; approved loopback run passed.
Disposable PostgreSQL restarted on 5432 rather than the previous command-line
port 56547; corrected test URL. One fingerprint-sensitive test overlapped runtime
editing and passed after edits settled. Hosted fixture cleanup raced background
cache writes; bounded filesystem removal retries fixed fixture cleanup. Final
review caught helpers inside default containers retaining shared mutable state;
recursive container cloning and dedicated regressions fixed it before deployment.
A broader local run found an outdated test expecting an unknown lexical name to
pass publication review; exact baseline 3a006a8 reproduces REGRESSION_FAILED. The
test now asserts that existing guard, without weakening source validation.
First hosted CI failed the new test’s default 5-second dialog assertion under
parallel editor load. The test now waits for the exact edited-expression and
preview responses, diagnoses their status and uses bounded hosted-operation waits.
All four compiled hosted tests subsequently passed together (22.93 seconds).
No original research or neighboring repositories were edited during benchmarks.

## Remaining questions

Deployment/live-label verification pending. Full local real-corpus verification
is not implied by focused parity checks. Timings exclude network/queue delays;
there is still genuine fresh validation work, so do not claim literal instant
saving. The pre-existing smoke-next legacy dialog flow remains outside this fix;
only its translated labels were updated.

## Suggested next prompt

Finish release checks, deploy with backup and preserved server grammar edits,
verify Portuguese controls and repeat disposable-server timing/parity checks.
