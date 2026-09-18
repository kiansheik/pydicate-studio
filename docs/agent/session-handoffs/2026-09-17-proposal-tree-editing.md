# Proposal tree editing and nominal output

## Goal
Restore context-menu editing and orientation controls while inspecting an AI proposal, default trees to vertical, and investigate the mismatching Nhemöabaré analysis.

## Files inspected
Agent index/current-state/repo-map/open-questions; AnalysisSupport, RuntimeTree, ExpressionCanvas, App, useStudio; analysis domain; scratch-service and agent-runner; browser harness/tests and provider runner tests. Read only the saved candidate records in the local profile to inspect actual expressions, evaluation and rationale.

## Files changed
- `src/components/ExpressionCanvas.tsx`: bottom-up fallback for all passages.
- `src/components/AnalysisSupport.tsx`: full preview canvas, local layout/position changes, explicit copy-on-edit and Editar no rascunho, edit error display, visible surface mismatch notice.
- `src/App.tsx`, `src/useStudio.ts`: revision-guarded acceptance then structural draft edit; expected revision prevents an async completion editing another draft.
- `electron/agent-runner.cjs`: investigate available inflection/nominalization operations before concluding mismatching compositional hypotheses; no mechanical morphology rule.
- `tests/analysis-workspace.spec.ts`: default orientation, local preview layout, actual context-menu duplication into draft.
- Agent current-state/log, contributor guide, authoring contract, this handoff.

## Commands run
- Targeted reads/searches and Prettier.
- `npm run build`: passed (existing large-chunk warning).
- Workspace Playwright suite on isolated port 5197: 12 old scenarios passed; new test initially used button rather than menuitem role. Fixed locator and focused rerun passed.
- Focused Playwright new proposal scenario plus real-engine secondary-piece/orientation canvas test: 2 passed.
- `node --test electron/tests/agent-runner.test.cjs`: 16 passed, deterministic transports.
- Local Python engine evaluation of saved candidate before/after `.var(1).base_nominal()`: onhemoabaré -> nhemoabaré.
- `git diff --check`.

## What worked
The preview now exposes the same context menu, operation controls and vertical/horizontal layout as normal editing. Merely inspecting or reorienting does not accept. Duplicate gesture accepts exactly once and creates a saved loose piece. Existing acceptance/undo and stale-input scenarios pass. The user's nominalization correction matches the tentative reading in the actual engine.

## What failed
Initial new browser test searched role button for a menuitem; corrected without changing production behavior. No live provider evaluation was attempted.

## Remaining questions
Prompt guidance cannot guarantee the model selects the right operation next time. Existing saved proposals remain preserved; no silent correction or new paid request was made. Literal diplomatic spelling/punctuation remains distinct from the tentative modern reading. Explicit saved horizontal layouts remain respected. A structural gesture on a proposal accepts its copy before applying the edit; both actions are undoable.

## Suggested next prompt
Use the proposal context menu to add .var(1).base_nominal(), then report any remaining friction in editing and whether incomplete analysis notices are clear.
