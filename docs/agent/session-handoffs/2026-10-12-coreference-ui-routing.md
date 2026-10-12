# Hidden reference identifiers and obstacle-aware links — 2026-10-12

## Goal
Respond to the user's UI critique: generate/hide reference labels, keep the dashed link, avoid cards and attach at the visible source/destination. Continue the authorized server rollout after validation.

## Inspected
Agent index/current-state/repo-map/open-questions; coreference design and prior deployment handoff; ExpressionCanvas, canvas-layout, runtime-tree, coreference domain/tests, canvas harness/spec, CSS; prior app-only deployment guard. Memory registry search had no relevant coreference hits; no memory-derived implementation fact used.

## Changed
src/components/ExpressionCanvas.tsx, src/expression-canvas.css, new src/domain/coreference-route.ts and coreference-route.test.ts, tests/canvas.spec.ts, docs/design/coreference.md, current-state.md, log.md and this handoff. Isolated release based on deployed `400f0b2` in `/private/tmp/pydicate-studio-hidden-label-release`; unrelated staged/unstaged work retained.

## Implementation and critique
Fixed raised curves that ignored obstacles and attached to badges. Multi-port Manhattan A* routes around visible geometry and labels, with bend costs and no colliding fallback. Operation ports attach to the actual pill left border, clearing its name/result. Ordinary cards support left/bottom ports; right ports avoid the connection/expand controls. Geometry includes saved positions and live drag previews. External chips are stacked in a left lane inside canvas bounds; separate click targets avoid the empty bounding rectangle of the entire route. IDs remain only in explicit source editing/persisted Python. Creation is one undoable transaction and reserves all IDs, including unresolved refs. Existing anchors/IDs are reused.

## Commands/results
- Final `npm run build` passes; `npm test` passes 37 files / 306 tests; isolated-port Playwright passes all four focused browser tests. `git diff --check` is clean. Runtime/Python unchanged, so their earlier deployment checks were not repeated.
- Unit geometry coverage: intervening cards, label/control clearance, differing node heights/directions, actual pill endpoints, 48-obstacle forest, enclosed-node no-route behavior.
- Browser coverage: no creation dialog; hidden IDs; uniqueness including dangling IDs; existing-anchor reuse; atomic undo; external passage navigation/unlink; sampled rendered path collision check before/during/after actual pointer drag.
- Screenshots inspected: before/after routed diagram; observed pill attachment corrected. External screenshot review caught a badge colliding with the incoming tree-edge label: replaced long repeated role text with a small side icon plus tooltip.
- Initial integration run exposed an oversized SVG link hit rectangle: corrected by assigning the link role to the chip alone. One test used a nonexistent harness setter: replaced with real pointer dragging. A multiple-title strict locator was corrected to inspect all title contents.

## Deployment
Pending. Same app-only preservation guard as prior rollout; no engine/corpus writes or credential replacement.

## Remaining questions
Links may cross tree edges or share a corridor; node avoidance does not imply edge avoidance. Overlapping cards can leave no free port; route omitted with a tooltip. External antecedent display still uses the other passage's normalized text. Real sentence/user acceptance is separate from fixture validation.

## Suggested next prompt
Test the routed pronoun link on the intended sentence and report any remaining overlap with nodes or labels.
