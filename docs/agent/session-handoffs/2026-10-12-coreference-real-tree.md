# Actual full-tree reference routing — 2026-10-12

## Goal
Correct the disproportionate dashed detour shown by the user, inspect the actual Chrome view and validate the saved full tree before the next authorized deployment.

## Inspected
Agent index/current-state/repo-map/open-questions; design/coreference; coreference-route and tests; ExpressionCanvas, runtime-tree, canvas-layout, CSS, browser canvas spec/harness. Native Chrome Studio tab on the user's indicated passage; SVG exported via its ordinary button. Memory search had no matching coreference entry. A parallel read-only reviewer diagnosed port/envelope/test weaknesses and extracted measured SVG geometry.

## Files changed
src/components/ExpressionCanvas.tsx, src/domain/coreference-route.ts, coreference-route.test.ts, src/expression-canvas.css, tests/canvas.spec.ts, new tests/fixtures/coreference-real-tree.json; docs/design/coreference.md, current-state.md, log.md and this handoff. Existing staged/unstaged work preserved. No lasting harness change from this iteration.

## Cause and implementation
Operations offered only a left-side port on their small operator pill, and whole label/result envelopes blocked empty space. The earlier fixture sampled only node-body rectangles in a shallow forest. Four validated result-card ports, separate rendered parts, edge-label obstacles and true escape distances now produce a local channel. Rounded bends stay within clearance; short arrowheads are constrained to their straight terminal segment. Linked result borders and inside badges clarify the referent. Parent hover text hides internal wrappers, and the redundant whole-SVG tooltip shown in the user's screenshot is removed. SVG export preserves vector-effect and stroke cap/join styles.

## Evidence and validation
- Exact root source, all 38 saved positions and measured rendered parts came from the latest native Chrome export `pydicate-composicao (1).svg`; fixture strips account/page metadata and duplicated relative geometry. Source/target are the same user's pronoun and antecedent. The browser projection replays recorded surfaces for geometry; it does not claim a new engine or linguistic evaluation.
- Independent full-tree review: local route approximately 878 world units/four points, versus the previous broad detour; warm fixture routing about 2–5 ms. Result and operator rectangles, controls, labels and all saved geometry are included.
- `npm run build`: passes. `npm test`: 37 files/307 pass. Five focused Playwright tests pass on strict private port 5198, covering hidden/automatic IDs, creation/undo/reuse, cross-passage navigation, real pointer drag, first-paint saved positions, view-only branch expansion to all 38 nodes, Ajustar and global Expandir tudo. The exact-tree path has no sampled collisions against pills, result boxes, operation/edge labels or controls, and stays below 1100 world units.
- Screenshots reviewed: saved full tree before/after fitting plus existing fixture scenes.
- Development issues: Node's JSON import needed an attribute; default overview hides deep nodes, so the test checks first-paint persistence then expands individual view branches without resetting coordinates; an incorrect toolbar scope for Expandir tudo was corrected. Final typechecking caught duplicate fixture-ID spread ordering; it was corrected before rollout. Fixture text rectangles contained inside cards are consolidated rather than expanded into false port blockers. Local headless SVG measurement needed sandbox escalation; the user's live browser was read/export-only during implementation.

## Deployment
Private release `312eba34b9f01d453a08b0f63cc382e84242dc29` is deployed and publicly healthy, based on `3ff54eb`. The final production build and rollout passed in 44.2 seconds. Database checkpoint `light-backups/20261012T202627-e7eacb` passes checksum and pg_restore readability; complete analysis archive is verified under `light-backups/coreference-full-tree-20261012T202556-6be8dd`.

Before/after parity found zero changes across nine tracked database tables (280 drafts, 3379 revisions), 148 checked research files, seven evidence files, 614 import files and 454 analysis-record files. Both Git indexes retain 1000:1000 / 0600 ownership/mode. No source publication, engine/corpus edits, pruning or credential replacement. The root working tree's pre-existing staged and unstaged work remains intact.

The same authenticated Studio Chrome passage was refreshed after rollout, and the new result-border styling loaded. View-only branch expansion and fitting were used for inspection; native window focus changed during the check, so automated all-38 collision/length claims come from the deterministic full-tree fixture, not from native AX counts. The user explicitly confirmed: "it looks soooo much better now". Further UI interaction stopped after that acceptance.

## Remaining questions
Secondary links may cross normal tree edges; no node arrangement is rewritten. Very dense or overlapping saved cards can leave no clear port. Zoom changes recalculate routing for marker sizing; measured one-link fixture is fast, but many-link performance remains unmeasured. The user has accepted the actual updated rendering; broader multi-link and extreme-overlap cases remain unmeasured.

## Suggested next prompt
Inspect the updated link in the same saved sentence and report any remaining ambiguous endpoint or visual collision.
