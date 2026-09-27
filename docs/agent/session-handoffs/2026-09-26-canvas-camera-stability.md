# Steady canvas camera and reusable tree rendering — 2026-09-26

## Goal
Stop the tree editor from jumping, recentring and rebuilding itself during
ordinary interaction. Zooming in and then selecting, adding a piece, detaching a
piece with **Soltar trecho** and any change of the viewport all moved the camera
away from wherever the contributor had put it.

## Inspected
`docs/agent/index.md`, `current-state.md`, `repo-map.md`, `open-questions.md`,
`src/components/ExpressionCanvas.tsx` (camera state, fit/focus effects, resize
observer, node and edge rendering), `RuntimeTree.tsx`, `src/domain/runtime-tree.ts`,
`canvas-layout.ts`, `useMorphemeTrace.ts`, `src/runtime-tree.css`,
`src/expression-canvas.css`, `App.tsx` projections, `tests/canvas-harness.tsx`
and `tests/canvas.spec.ts`.

## Found
- The `ResizeObserver` refitted the whole extent on every viewport change,
  including sub-pixel reflows and the scrollbar that the selection inspector
  summons. Selecting a constituent could therefore reframe the entire tree.
- Focusing a piece hard-set the camera to `zoom: 0.85`, discarding the
  contributor's scale. A new loose piece, a detached branch, a combination, the
  initial promotion of a sole root and the overview button all took that path.
- Jumping to a search match reset the zoom to 1 and centred the match.
- Every camera nudge re-rendered all nodes, and each node searched the whole
  morphology graph for its evaluation, so panning cost O(nodes²) per event.
- Fit zoom had no lower clamp and the two zoom buttons repeated their own limits.

## Changed
- `src/domain/canvas-camera.ts` (new): the shared camera type, `clampZoom`,
  `visibleWorld`, `fitCamera`, `revealCamera` and `sameCamera`. `revealCamera`
  returns the identical camera when a box is already visible, so an unnecessary
  move never reaches React at all, and otherwise pans by the smallest amount
  that uncovers the box at the contributor's own zoom.
- `src/domain/runtime-tree.ts`: `TreeCamera` is now that shared type and
  `zoomRuntimeAt` clamps through `clampZoom`.
- `src/components/ExpressionCanvas.tsx`:
  - the resize observer rounds to whole pixels, coalesces through one animation
    frame and drops repeats; a resize no longer refits anything.
  - only the first tree is framed. Afterwards focusing a piece or a selection
    reveals it, keeping zoom and position.
  - entering fullscreen refits explicitly, which is the one resize a contributor
    actually asks for.
  - the search jump and the reading-direction switch no longer invent a zoom;
    changing direction and **Visão geral** refit deliberately instead.
  - node and edge elements are built in `useMemo` from the layout alone, behind a
    stable handler façade, so panning and zooming reuse them untouched.
  - node evaluations for morpheme tracing come from one `Map` instead of a scan
    per node; both zoom buttons clamp through `clampZoom`.
- `src/domain/canvas-camera.test.ts`: 11 unit checks over the camera rules.
- `tests/canvas.spec.ts`: four browser regressions — selecting after zooming
  leaves `viewBox` untouched, a search jump keeps the zoom and still brings the
  match into view, detaching keeps the zoom and shows the loose piece, and a
  viewport resize keeps the centre and scale.

## Validation
- `npx vitest run`: 243 passed (29 files), including the new camera checks.
- `npm run typecheck`: passed. `npm run format:check`: passed.
- `npx playwright test tests/canvas.spec.ts tests/runtime-tree.spec.ts tests/expression-tree.spec.ts`:
  87 passed, 5 failed — the same five that fail on `ae4b4c8` without these
  changes (verified by stashing the component and rerunning them).
- `npx playwright test tests/studio.spec.ts tests/analysis-workspace.spec.ts tests/streamlined-desk.spec.ts`:
  25 passed.
- Three of the four new browser regressions fail on the unchanged component and
  pass with it, confirming they describe the reported behaviour.

## Outcome / limits
Manual node positions, saved drafts, evaluation and morpheme evidence are
untouched; only which camera the canvas chooses, and how often the tree is
rebuilt, changed. Dragging a node still rebuilds the rendered tree each pointer
move, because the drag preview moves a subtree; that path is now cheaper but not
incremental. Resizing a dock no longer reframes the tree at all, so a contributor
who wants the old behaviour presses **Ajustar**.

## What failed
The first browser regression for selection after zooming passes on the unchanged
component too: the test harness page never scrolls, so the inspector cannot
summon the scrollbar that triggered the refit in the real desk. It is kept as a
guard, and the resize regression covers the same cause directly.

## Remaining / suggested next prompt
Node dragging could update only the dragged subtree and its drop target instead
of the whole diagram. Suggested next prompt: report whether dragging a large
branch still feels heavy, and on which passage.
