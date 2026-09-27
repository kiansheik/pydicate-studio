# Expandir tudo lays out the expanded tree — 2026-09-27

## Goal
Fix the reported overlapping leaf cards and crossed connections when clicking
**Expandir tudo**, without requiring a separate repair action or changing source.

## Files inspected
- Required agent index, current state, repository map and open questions;
  previous camera-review handoff and Canvas design contract.
- `src/components/ExpressionCanvas.tsx`, `src/domain/canvas-layout.ts`,
  `src/domain/canvas.ts`, `src/useStudio.ts`, and existing layout/browser tests.
- The reported local draft, read-only: the same 12-node expression and saved
  positions reproduced the second screenshot. Tests contain only that bounded
  fixture and never read or write the real profile.

## Root cause and prior omission
The automatic tree layout correctly reserves space for branches and wrapped
results. Saved absolute positions override those coordinates. The previous
iteration only exposed a separate **Organizar árvore** action; **Expandir tudo**
still revealed every branch with the conflicting overrides intact and refitted
the camera around the resulting overlap. Testing only the separate action did
not cover the user's actual workflow.

## Files changed
- `src/components/ExpressionCanvas.tsx`: extracted shared `organize()`; global
  expansion clears collapsed branches and runs automatic placement before one
  post-layout fit. Resets call the existing undoable canvas edit only when saved
  positions exist. Individual chevrons and ordinary camera interactions retain
  manual placements.
- `tests/canvas.spec.ts`: exact saved 12-node bottom-up fixture plus horizontal
  coverage; direct expansion, disjoint cards, parent/child direction, operand
  order, unchanged source/evaluation/loose pieces, one-step undo, repeat-click
  stability, and the single-branch placement contract.
- `docs/agent/{current-state,repo-map,log}.md`,
  `docs/design/canvas-editor.md`, this handoff.

## Commands run / what worked
- Targeted `rg`, `git diff`, source reads and read-only JSON inspection.
- Before the fix: the direct-expansion regression failed specifically because
  `abá` overlapped `mbae`; saved screenshot/trace under
  `/tmp/pydicate-expand-before/`.
- After the fix: all three new browser regressions passed using
  `npx playwright test tests/canvas.spec.ts --grep 'Expandir tudo restores|expanding one branch' --output=/tmp/pydicate-expand-after`.
- Visually inspected the before/after SVG screenshots. The expanded main tree
  retains all 12 nodes with separated leaves and orderly connections. A separate
  loose piece in the regression fixture remains intact.
- Twelve existing browser compatibility checks passed: long wrapped results in
  both orientations, manual subtree movement, drag swaps, detach/reconnect/undo,
  restored roots, fullscreen, selection/resize stability, organization, and
  Alt/middle-button panning. Ran `npx playwright test tests/canvas.spec.ts -g
  'long root, intermediate|organizing an overlapping|over a node pans|selecting a piece after zooming|resizing the desk|context-menu detach persists|real pointer dragging|moving a subtree in blank|restored sole loose|fullscreen frames'
  --output=/private/tmp/pydicate-expand-compatibility`.
- `npx vitest run src/domain/canvas-layout.test.ts src/domain/canvas.test.ts src/domain/canvas-camera.test.ts`: 54 passed.
- `npm run typecheck`, `npx vite build`, changed-file Prettier check and
  `git diff --check` passed. Vite retains its existing chunk-size advisory.

## What failed
The previous iteration's test clicked **Organizar árvore**, so it could pass
while the reported **Expandir tudo** workflow remained broken. The new test
fails on that prior implementation and passes on the direct workflow fix.

## Remaining questions
The user profile and corpus were not edited by the agent. Reorganization is
performed by the contributor's global expansion action and can be undone.
Individual branch expansion remains a view action that honors manual placement;
it does not silently reorganize intentionally arranged subtrees. This turn did
not publish a release or claim packaged-desktop acceptance.

## Suggested next prompt
Check **Expandir tudo** in the updated desktop on the reported saved passage,
then zoom into its leaves, undo the layout reset, and expand again.
