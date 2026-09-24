# Ground-truth save diagnosis — 2026-09-24

## Goal
Resolve rejected usage logging after approval and investigate the remaining Araújo test failure.

## Inspected
- `src/App.tsx`, `src/useStudio.ts`, `src/domain/usage.ts`.
- `electron/usage-service.cjs`, `electron/tests/usage.test.cjs`.
- `python/authoring_runtime.py`, `authoring_service.py`, `passage_references.py`, relevant approval tests.
- Read-only neighboring Araújo source/JSONL, upstream approval and test-loading code.
- Local usage events and recovery journal summaries (read-only).

## Findings
The last approval journal records ordinal 60, with `arobîar ybakype i îeupiragûera Tupã tuba 'ekatûaba koty sena bé`. The failing test concerns ordinal 55. Its bounded current evaluation agrees with the user's native test actual (`i îemonhangagûera`); the saved reference still has `oîemonhangagûera`. No evidence of a wrong rendering or failed write for the selected ordinal was found. Logging occurs after successful approval and its rejected promise is swallowed by `track`, so it does not undo approval.

## Changed
- `src/App.tsx`: use allowed `review.status` event and allowed `action`/`source` details.
- `src/useStudio.ts`: identify source and ordinal in successful approval confirmations.
- `electron/tests/usage.test.cjs`: validate literal renderer tracking events against the privileged allowlist; approval detail preservation.
- `python/tests/test_passage_order.py`: reapproval updates exactly the selected existing reference; another mismatch persists until independently approved.
- `tests/ground-truth.spec.ts`: assert saved passage identity in confirmation.
- Agent current state, log and this handoff.

## Commands and results
- Read-only bounded AST evaluation of Araújo 55: reproduced reported actual.
- `node --test electron/tests/usage.test.cjs`: 9 passed.
- `python3 -B -m unittest python.tests.test_passage_order.PassageOrderTests.test_reapproval_updates_only_selected_legacy_record_and_leaves_other_mismatch_visible -v`: passed using disposable corpus.
- `npm run typecheck`: passed.
- Focused Playwright `ground-truth.spec.ts` (`one reviewed acceptance|unchanged source`) using `/private/tmp/pydicate-multipage.config.ts`: 2 passed.
- Prettier on changed TS/CJS files: passed.

## Failures / boundaries
Initial browser server bind was sandbox-denied (EPERM); rerun with approved escalation passed. No live contributor source module was executed, no neighboring repository was modified, and live corpus `make test` was not rerun. Existing dirty changes were preserved.

## Remaining / next prompt
Passage 55 still needs an editorial choice between its current analysis and its old reference; approving passage 60 cannot resolve it. Restart/reload Studio for the fixed renderer. Suggested next prompt: Review Araújo passage 55 and determine whether its analysis or approved surface should change.
