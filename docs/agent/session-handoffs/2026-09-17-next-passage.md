# One-click next passage and bottom-up composition

## Goal

Replace the confusing separate new-passage form with one click into an empty ordinary tree editor. Carry cumulative book location/hierarchy and a noninteractive PDF guide, add a visual predicate catalog, vertical building, and drag/chaining operations. Preserve existing drafts, source/reference separation and the user's no-provider-usage constraint.

## Files inspected

- Agent index/current-state/repo-map/open-questions; existing PDF/canvas/source-authoring contracts and previous handoffs.
- `App`, `useStudio`, `SourcePane`, `GroundTruthPanel`, `AuthoringEditor`, `PassageLexicon`, `ExpressionCanvas`, `RuntimeTree`, `TreeScopeEditor`, `PdfEvidence`, draft/canvas/evidence/lookup types and models.
- Desktop routing, validation, draft store, Python worker, evidence and provider context boundaries.
- Python authoring service/runtime, source-comment parser and pending context/lexical/partial-evaluation tests.
- Read-only neighboring source/lexicon/reference locations and the existing disposable native-test infrastructure.

## Files changed

- `src/App.tsx`, `useStudio.ts`, `domain/next-page.ts`, `types.ts`, `model.ts`: projected pending passage shells, cumulative effective metadata, predecessor/ordinal provenance, normal editor selection/restart, blank-tree handling and revision-bound source migration. Source append previews enforce pending creation order.
- `SourcePane.tsx`, `GroundTruthPanel.tsx`, `workbench.css`: section/subsection fields with existing-title suggestions, pending guidance/review wording, inherited page and mapped evidence identity. `AuthoringEditor`/`PassageLexicon` now pass pending source context; conflict UI includes hierarchy.
- `ExpressionCanvas.tsx`, new `PredicatePalette.tsx`, `RuntimeTree.tsx`, `TreeScopeEditor.tsx`, canvas model/new layout helper and CSS: real engine catalog/forms, in-canvas +, persisted orientation, root-to-root combine chooser and quick variant/imperative chains. Exact ordered AST operations remain source of truth.
- PDF component/domain/CSS and `electron/evidence-service.cjs`: separate saved guide/view, zero new owned regions, predecessor fallback and guide-only save semantics.
- `electron/validation.cjs`, `next-service.cjs`, `python-worker.cjs`, `provider-context.cjs`: pending/hierarchy/layout persistence and routing, predicate RPCs, reserved PDF identity and explicit unsaved AI provenance. Pending ordinals cannot be sent to upstream published-source lookup.
- `python/authoring_service.py`, `authoring_runtime.py`: pending append namespace, 12 actual constructor signatures/field typing, isolated evaluation/lexical reads, bounded declaration provenance, full pending assistant context and hierarchy source round-trips. Saved-only write/reference guards remain.
- Focused new/extended domain, desktop, Python and browser tests. `NewPassageDialog` remains for legacy regression fixtures but is no longer mounted by App.
- Agent current-state/log/map/open-questions, new next-passage contract and existing canvas/PDF contracts. Subtask handoffs document PDF and App test details.

## Commands run

- `npm run build` / TypeScript checks; targeted Prettier write/check and `git diff --check`.
- `npm test -- --run src/domain/next-page.test.ts src/domain/model.test.ts src/domain/evidence.test.ts src/domain/canvas.test.ts src/domain/canvas-layout.test.ts src/domain/structure-drafts.test.ts`: **54 pass**.
- `node --test electron/tests/pending-validation.test.cjs electron/tests/pending-assistant-context.test.cjs electron/tests/canvas-validation.test.cjs electron/tests/evidence.test.cjs electron/tests/python-worker-authoring.test.cjs`: **21 pass**. Agent also ran the three project-watch regressions.
- `python3 -B -m unittest python.tests.test_pending_authoring -v`; focused rendered reuse/partial evaluation/source metadata/lexical identity/full-passage/active inventory checks: **44 distinct checks pass**, as reported by backend subtask. These execute local Python only.
- `npx playwright test tests/canvas.spec.ts`, `tests/pdf-evidence.spec.ts`, `tests/next-passage.spec.ts` (plus focused correction/order reruns): **22 scenarios pass** (14 + 4 + 4). Browser transport for App/session tests is explicitly simulated; canvas tests use the real engine and PDF tests actual PDF.js vector rendering.
- `/tmp/pydicate-freeze-fixture.mjs` creates disposable sibling repository copies without copying the huge engine object store.
- `/tmp/pydicate-next-native.mjs` launches the compiled Electron app against a temporary profile and frozen corpus. `/tmp/pydicate-next-apply-native.mjs` exercises reviewed source application only in that copied corpus. Final artifacts/report: `/tmp/pydicate-next-native-OcO82W/`; source fixture: `/tmp/pydicate-canvas-fixture-ORhANA/`.

## What worked

- One click opens passage83 directly in the usual editor, with empty analysis, bottom-up layout, inherited last edited page/section/subsection and no modal. Multiple pending shells preserve their own readings and inherit cumulative locators; normal undo/redo and selected-shell restart pass.
- Native catalog lists12 actual types. Two form-created nouns were connected by dragging and choosing `+`; the result `aba poranga` exactly matches independent Python execution. Switching layout leaves expression/result unchanged.
- PDF guide is visibly separate and noninteractive; drawing creates independent evidence. Previous saved box is byte-equivalent after saving the new box. Restart restores the pending selection, canvas, hierarchy, guide and own region.
- Source review shows `@section`/`@subsection` and reserved stable identity. Reviewed application in the disposable corpus converts the shell into a real source passage, preserves equivalent expression structure and local canvas/evidence, and does not approve ground truth.
- Pending lexical/assistant context reads are supported without inventing saved references. Provider boundary tests use mocks; no provider or live MCP requests occurred.
- Original corpus source, lexicon and historical references stayed byte-identical. No neighboring edits, commits or pushes.

## What failed and was corrected

- Early TypeScript integration lacked the wrapper `sourceId` prop; forwarding it through the tree wrappers resolved the error.
- One browser locator included controlled textarea contents after redo; using the textbox accessible name fixed the assertion. Underlying undo state was correct.
- The first native result check accepted the temporary `Avaliando…` label. Tightened it to require a successful root and an independent Python result, then reran the workflow successfully.
- Native review test initially used an incorrect accessible dialog name. After correcting it, application worked; an overly strict raw-byte assertion then encountered the source writer's normal `l += (...)` wrapper. The final check requires equality with imported source and independent AST equality with the original draft, preserving meaningful syntax rather than claiming identical wrappers.
- Vite still reports the existing large-chunk advisory; build succeeds.

## Remaining questions

- The actual historical PDF has not been tested; evidence checks use a rendered vector fixture.
- Upstream comments cannot encode clearing an inherited section. Preview explains the limitation while preserving the draft; subsection reset is supported by re-emitting its section.
- Publication follows pending creation order; queue reordering/discarding is not yet exposed. Creation still targets Araújo.
- Predicate creation makes inline expressions, not automatically shared lexical definitions. Arbitrary-depth hierarchy, multi-selection and portable shared forests remain future work.
- Final human assessment of drag feel, panel density and palette terminology is still needed; automated checks do not substitute for the user's editing feedback.

## Suggested next prompt

Create the next Araújo passage with the + button, draw its PDF box, build two or three predicates in the vertical canvas, and identify the first interaction that feels cumbersome. Keep provider generation checks disabled unless explicitly requested.
