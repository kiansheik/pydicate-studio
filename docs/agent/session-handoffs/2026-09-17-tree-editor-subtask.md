# Tree editing subtask

## Goal

Make the evaluated-object tree usable for concise source editing, remove misleading duplicate-looking morphology branches, and provide focused cursor-centered wheel zoom. Preserve historical source and avoid all provider generation requests.

## Files inspected

- Agent index, current state, repository map and open questions.
- `src/components/RuntimeTree.tsx`, `AuthoringEditor.tsx`, `src/domain/authoring.ts`, `runtime-tree.ts`, types and tree styles/tests.
- `python/authoring_runtime.py`, `studio_authoring.py`, tree tests and Araújo audit.
- Read-only engine `predicate.py`, postposition, verb, noun, deverbal and related object implementations; actual Araújo expressions and contextual namespace.

## Files changed

- `src/components/RuntimeTree.tsx`, `src/domain/runtime-tree.ts`, `src/runtime-tree.css`.
- `python/authoring_runtime.py`, `python/tests/test_runtime_tree.py`.
- `src/domain/runtime-tree.test.ts`, `tests/runtime-tree.spec.ts`, `tests/runtime-tree-harness.tsx`.
- This handoff. Parent task owns App/hook integration, current-state and work-log updates.

## Behavior and evidence

The first line's apparent duplicates were distinct engine `Postposition.arg0` morphology copies alongside `arguments[0]`, not duplicate SVG keys. All object identities remain in the graph. The normal view follows structural relationships (15 first-line objects); an explicit **Cópias de realização** layer exposes all 21 objects. Search follows that layer. Quoted names such as `"oré"` select exact names; broad search also covers definitions and traits.

Interpreter provenance tags pass through Pydicate's own copy mechanism and record exact authored scopes; immutable Studio tags are excluded from grammatical shape fingerprints. Copies retain origin while distinct source occurrences remain separate. No label matching establishes an editable span. Generic property inspection no longer invokes `Postposition.noun`, whose getter performs another realization.

The inspector can choose an exact scope, replace it, apply supported methods/operators, insert lexical references and undo/redo through the shared draft. Source text must still match the proven UTF-16 span. Unmapped reused-composite internals remain read-only. **Preparar cópia desta ocorrência** obtains an explicit expansion preview only when interpreting the lexical definition produces exactly the current namespace object's grammatical shape; contextual mismatches and parameterized helpers stay unexpanded. Applying the preview only replaces that occurrence.

The wheel zooms only after canvas focus, and fixes the model coordinate under the pointer. Search, collapse, reference inspection, SVG export, keyboard navigation and fullscreen remain available. The canvas stays mounted during evaluation so fullscreen and camera survive editing; stale scopes cannot edit a newer raw revision.

The runtime also routes the separate lexical agent's `active_lexicon` child action to its inventory module, and exposes `sourceOccurrences`, direct `lexicalOrigins`, and actually callable `methods` in graph nodes.

## Commands run and results

- `npm run typecheck` — passed.
- `npm test -- src/domain/runtime-tree.test.ts` — 7 tests passed.
- `python3 -B -m unittest python.tests.test_runtime_tree -v` — 8 tests passed. Includes all 82 actual Araújo expressions compared against uninstrumented interpretation for exact surface, annotation and full grammar shape; original source bytes checked unchanged. Also checks three distinct `oré` source occurrences, two first-line realization-copy branches, shared/cyclic identities, read-only composite interiors and rejected stale-context expansion.
- `npx playwright test tests/runtime-tree.spec.ts --output /tmp/pydicate-tree-tests` — 8 scenarios passed. Includes actual first-line editing of one `oré` occurrence with full result preservation; actual reused construction in passage 60; fullscreen retained after new graph; focus-only cursor-anchored wheel zoom; exact source scope replacement/undo; morphology-copy search layer; existing tree interactions.
- `npx prettier --write` on changed TypeScript/CSS test files.
- Inspected `test-results/actual-araujo-tree-editor.png` after the actual first-line browser run.

Initial sandbox browser launch could not bind localhost; authorized local browser execution succeeded. One simultaneous suite cleared shared Playwright artifacts; isolated output resolved it. Early test assertions incorrectly assumed broad substring search would find only exact `oré` names and used an ambiguous selector that also matched collapse controls; exact-name search and pressed-node selectors now make those assertions precise. No provider requests ran.

## Remaining questions

Parent must supply RuntimeTree's editor props (`authoringRoot`, current `raw`, revision, passage ID, onChangeRaw, undo/redo, lexical inspection callback) and integrate the new primary workspace layout. The tested tree primitive provides scope operations; arbitrary semantic edge rewiring and edits to unmapped shared-definition interiors still require explicit source/lexicon operations. Visual output was checked in browser fullscreen using the actual first line, not a packaged installer.

## Suggested next prompt

Continue refining tree authoring from local usage: inspect navigation/edit sequences, verify complex occurrence expansion against current engine shapes, and add explicit capabilities only where actual Pydicate source/runtime correspondence is proved.

## Integration review follow-up

Reviewed the parent's App/tree prop wiring, current-result/revision filtering, GroundTruthPanel, approval hook and authoritative persistence path. App now supplies the editing props and passage ID; this supersedes the pending integration note above. The optional direct `onInspectLexeme` callback was not yet connected at review time.

Found and fixed two bounded invariants after reporting them to the parent:

1. The approval sink previously trusted the upstream commit's second rendering even if it differed from the earlier surface the human reviewed. An isolated temporary-corpus probe demonstrated a reviewed value of `REVIEWED` being saved as `DIFFERENT`. The final sink now compares the target record's actual surface against the selected upstream `normalize_surface(reviewedSurface)` before any recovery or reference write. Regression proves mismatch creates neither file, while canonical punctuation normalization succeeds. Serialization remains unchanged.
2. A retained prior tree could emit an old source path while the next AST revision had a different constituent at that path. Clicking a node now emits an edit scope only after validating its provenance against the current AST/raw; otherwise selection returns to the complete expression. Browser regression exercises the stale graph/current AST case.

Final focused follow-up: 9 Python tree/approval tests and 9 browser tree tests passed (`--output /tmp/pydicate-tree-review-tests`), including all 82 engine parity checks and actual first-line/complex browser examples. No real corpus approval or provider call occurred. Parent should rebuild production assets after the final TypeScript guard before its native smoke.

## Cross-pane reveal and initial overview follow-up

The lexical agent's integration review found that external source selection highlighted a runtime object without opening its hidden ancestors. External selection now validates the current source occurrence, waits for the measured viewport, opens ancestors and centers the requested object once. The inspector selects that exact source scope, including lexical references that share the complete expression's runtime object. It does not emit selection feedback, and routine graph reevaluation preserves manual camera changes.

The parent's native screenshot also showed a dense root collapsing to one opaque card. The initial overview now retains at least the first relationship level for every nontrivial graph, allowing a smaller scale when the preferred fit is impossible. The actual first Araújo line at a narrow editor width opens with six objects and five relationships.

Final renderer follow-up: 13 browser scenarios passed using `/tmp/pydicate-tree-final-tests`; 8 domain tests and TypeScript passed. Added external hidden-scope reveal, selection before tree mount, no camera reset after reevaluation, exact shared-object source scope, and actual first-line narrow overview regressions. Python was unchanged during this follow-up. Parent owns the final production rebuild/native integration run.
