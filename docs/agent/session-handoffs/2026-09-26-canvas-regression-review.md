# Canvas regression review and saved-layout recovery — 2026-09-26

## Goal
Review `e210c5d` against the preceding tree behavior, repair camera regressions,
and investigate the screenshot showing a floating composition and overlapping
lexical cards without changing linguistic source or discarding saved work.

## Files inspected
- Required agent index, current state, repository map and open questions;
  earlier camera handoff and Canvas design contract.
- `src/components/ExpressionCanvas.tsx`, `RuntimeTree.tsx`, `WorkspaceLayout.tsx`;
  `src/domain/{canvas,canvas-camera,canvas-layout,runtime-tree}.ts`; associated CSS.
- `tests/canvas.spec.ts`, `tests/canvas-harness.tsx`, tree browser/domain tests and Playwright config.
- Actual local draft and categorical usage events, read-only, to identify the
  screenshot's saved positions; no profile or neighboring repository was edited.

## Findings
- Hidden workspace panes remain mounted. The previous change could fit against
  placeholder or zero-clamped dimensions and never correct the frame on reveal.
- Fullscreen fit ran before ResizeObserver published its new size. A narrow-pane
  reproduction stayed at 39% until **Ajustar** corrected it to 93%.
- First-evaluation completion could still reclaim the camera after navigation.
- A restored sole loose root could queue focus on the fragment being promoted
  rather than its new main root; its initial frame now waits for that root's parse.
- `openCanvas()` previously always pressed **Ajustar**, masking initial-fit bugs.
- Missing saved canvas state created fresh empty arrays/maps on every render,
  defeating the previous memoization during camera movement. The empty fallback
  now remains stable until the actual saved canvas changes.
- The screenshot matched persisted manual positions: `/` almost level with its
  parent, `mbae` overlapping `abá`. Five recorded position edits matched the saved
  draft timestamp. Whether the contributor intended those drags is unknown.
  Source connections were intact; the camera change did not rewrite the graph.

## Files changed
- `src/components/ExpressionCanvas.tsx`: measured initial/fullscreen framing,
  camera ownership during loading, fullscreen return, undoable **Organizar árvore**,
  and Alt/middle-button panning over cards.
- `tests/canvas-harness.tsx`, `tests/canvas.spec.ts`: hidden-pane and delayed-evidence
  fixtures; camera initialization, navigation, layout recovery and gesture checks.
- `docs/agent/{current-state,repo-map,log}.md`, `docs/design/canvas-editor.md`, this handoff.

## Commands run and validation
- `git show`, `git diff`, targeted `rg`/file reads and read-only saved-state inspection.
- `npm run typecheck` and `npx vite build` passed; the existing chunk-size advisory remains.
- Prettier on changed TS/TSX files and `git diff --check` passed.
- `npx vitest run src/domain/canvas-camera.test.ts src/domain/canvas-layout.test.ts src/domain/canvas.test.ts src/domain/runtime-tree.test.ts src/domain/expression-tree.test.ts`: 74 passed.
- Full tree browser suite: **96 passed, five existing failures** across 101 checks,
  including every new camera/gesture/layout regression. Ran with two workers
  and isolated port 5176 through `/private/tmp/pydicate-tree-review.config.ts`:
  `npx playwright test --config /private/tmp/pydicate-tree-review.config.ts tests/canvas.spec.ts tests/runtime-tree.spec.ts tests/expression-tree.spec.ts`.
- After the final one-line empty-canvas memoization, reran the actual workspace
  and camera/layout/gesture subset with the same config and a targeted `-g`:
  **14 passed**. Typecheck and production Vite build passed again. The broader
  suite count above precedes only that memoization; baseline failure artifacts
  remain in the independent snapshots listed below.
- Exact saved-tree replay in an isolated browser: all 12 nodes and identical
  source/results retained, two overlaps reduced to zero after organizing.
  Inspected `/tmp/pydicate-real-tree-{before,organized}.png` visually.

Baseline: 92 tree browser checks on an isolated `e210c5d` snapshot produced
86 passes and six failures. One search-cancellation timeout passed unchanged
on repeat. The other five reproduced on the pre-camera parent `ae4b4c8`:
stale search options, a missing fixture lexical entry, a morphology evaluation
request-count expectation, a reference surface changed in the selected engine,
and an Araújo 60 whitespace-difference assumption. All 26 legacy expression/runtime
tree checks passed. Snapshot evidence is under
`/private/tmp/pydicate-tree-baseline-{e210c5d,ae4b4c8}/test-results*`.

## What worked / failed
The hidden-pane and fullscreen regressions failed on the unmodified component
and passed after repair. Stable selection/search/detach/resize checks continued
to pass. Organizing preserves source/results/loose pieces and supports one-step
undo; navigation over a card preserves its world position and edit history.
The fullscreen test initially captured the frame less than one animation frame
after entry; it now waits for measured SVG/viewBox aspect agreement. Three
consecutive fullscreen runs passed. Restored-singleton and delayed **Ajustar**
tests also exposed and now cover focus/ownership timing races.

The sandbox blocked the local test server's loopback bind. The same local browser
checks ran after approved sandbox escalation. No generated documentation or
corpus records were rebuilt. Baseline browser failures are compared separately
instead of being presented as a green full suite.

## Remaining questions
Manual placements are preserved until the contributor explicitly organizes
them. Actual user profile state was not rewritten. Browser fixtures validate
rendering and interaction; this session did not publish a release or perform a
packaged desktop acceptance run. Dragging a large subtree still rebuilds its
preview; the existing camera memoization remains in place.

## Suggested next prompt
Verify the repaired editor in the desktop with the saved passage: use
**Organizar árvore**, zoom into `mbae / katu`, then pan with Alt-drag, detach,
reconnect and undo while checking the view stays usable.
