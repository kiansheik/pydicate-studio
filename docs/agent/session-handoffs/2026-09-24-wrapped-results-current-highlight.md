# Wrapped results and live current-result highlighting — 2026-09-24

## Goal
Show complete long output in every tree box, and reflect tree selection in the
existing **Resultado atual** text next to the saved reference.

## Inspected
Agent docs, `App.tsx` projection/comparison flow, `RuntimeTree.tsx`,
`ExpressionCanvas.tsx`, `useMorphemeTrace.ts`, morpheme display/trace code,
`runtime-tree.ts`, `canvas-layout.ts`, their tests and browser harnesses.

## Changed
- `src/domain/runtime-tree.ts`: complete word wrapping, grapheme-safe long-word
  breaks, dynamic root/operation/reference heights; no ellipsis in results.
- `src/domain/canvas-layout.ts`: subtree-width reservation and vertical bands
  sized by each depth's maximum height, preserving spacing around long outputs.
- `src/components/ExpressionCanvas.tsx`, `RuntimeTree.tsx`: lexical results use
  wrapped lines and dynamic card/accent height, just as operation results do.
- Canvas publishes context-bound main-root ranges through `onSurfaceHighlight`;
  `App.tsx` uses them in the existing generated paragraph through `MorphemeText`.
  Exact passage/raw/revision/engine/surface must match and the actual tree must be
  active; loose selections, unmount, pending work and missing evidence clear it.
- `src/domain/morpheme-display.ts`: typed surface highlight callback payload;
  removed inferred truncation so literal source ellipses retain their highlight.
- `src/expression-canvas.css`: same highlight palette in current-result panel,
  including dark/light themes.
- Layout/domain and canvas browser regression tests, contributor/morpheme docs,
  agent current state/map/log and this handoff.
- One pre-existing optional-field test access in `morpheme-trace.test.ts` narrowed
  after typecheck exposed it; no change to test behavior.

## Validation
- `npx vitest run src/domain/runtime-tree.test.ts src/domain/runtime-layout.test.ts src/domain/canvas-layout.test.ts src/domain/morpheme-display.test.ts src/domain/morpheme-trace.test.ts`: 46 passed.
- `npm run typecheck`: passed.
- `npx vite build`: passed (existing chunk-size advisory).
- Prettier checks on changed source files and `git diff --check`: passed.
- Browser geometry: 2 passed with real long root, intermediate and reference
  surfaces. Full text is enclosed and boxes do not overlap in either orientation.
  `/private/tmp/complete-node-results-bottom-up.png` inspected.
- Actual App workspace browser test: 1 passed with real-engine evaluation snapshots
  in the simulated project bridge. Current-result marks follow selection without
  another evidence request; saved reference remains plain; loose selection and
  code/draft changes clear marks. `/private/tmp/workspace-selected-result.png`
  inspected. No provider or corpus writes involved.
- Existing five morpheme browser regressions plus legacy scope edit: 6 passed.
  **9 distinct browser checks passed** total. All used
  `npx playwright test --config /private/tmp/pydicate-multipage.config.ts` with
  `tests/canvas.spec.ts` (long root, actual workspace and morphology cases) and
  `tests/runtime-tree.spec.ts` (verified source scope edits case). Servers stopped.

## Outcome / limits
Complete source output text stays inside its existing node box; saved source,
reference and draft data are not rewritten. Current-result highlighting consumes
already captured canvas evidence and does not request another evaluation. Normal
saved manual positions remain user-controlled. No neighboring repositories,
provider calls, commits, generated source or approval records are changed.

## What failed
Initial typecheck caught an unused sizing import after changing the leaf rectangle,
and an optional-field access in a previous morphology fixture. Both corrected. Independent review also caught the old literal-ellipsis truncation
heuristic; it was removed and covered by a focused test.

## Remaining / suggested next prompt
No further requested product work anticipated. If a manually positioned tree
needs a new arrangement after a large text change, use its existing layout tools.
Suggested next prompt: report a particular long expression whose wrapping or
highlighting remains difficult to read.
