# Compact short leaf branches — 2026-09-27

## Goal
Bring the right-hand leaves closer to the main branch after **Expandir tudo**,
preserving the repaired non-overlapping layout and normal editor behavior.

## Files inspected
Required agent docs; `src/domain/canvas-layout.ts`, its tests, existing exact
saved-tree browser regressions, and the previous expansion handoff.

## Files changed
- `src/domain/canvas-layout.ts`: replace whole-subtree rectangles with left/right
  contours at each depth. Pack siblings with the existing 70-unit minimum gap,
  center the parent over its immediate first/last child, and retain depth heights.
- `src/domain/canvas-layout.test.ts`: short leaf beside a broad deep branch,
  including the mirrored case, close sibling spacing, parent centering and
  disjoint deeper leaves.
- Agent current state, repository map, log and this handoff.

## Commands run / results
Targeted `rg` and source reads; changed-file Prettier; `npx vitest run
src/domain/canvas-layout.test.ts` (four passed); `npm run typecheck` passed.
Nine focused browser checks passed with `npx playwright test tests/canvas.spec.ts
-g 'Expandir tudo restores|expanding one branch|long root, intermediate|real pointer dragging|moving a subtree in blank|resizing the desk|selecting a piece after zooming'
--output=/private/tmp/pydicate-compact-branches`. These cover the exact saved
tree, both orientations, long result boxes, manual placement, drag swaps,
selection and resize stability. The new screenshot was visually checked:
the short right leaves now sit close to their sibling operations, and the main
tree's leaves and connections remain separated. `npx vite build`, Prettier and
`git diff --check` passed; Vite retains its existing chunk-size advisory.

## What worked / failed
The previous layout treated empty space below a short leaf as occupied all the
way down its deep sibling. Per-depth contours remove that unnecessary spacing
while keeping horizontal layout, node contents, source order and editing intact.
No source, corpus, user profile or generated corpus files were edited.

## Remaining questions
Only automatic bottom-up geometry changes. Existing manual positions are retained
until the contributor uses **Expandir tudo** or **Organizar árvore**. No release
or packaged-desktop acceptance is claimed.

## Suggested next prompt
Inspect the compact expanded tree in the updated editor at your usual zoom.
