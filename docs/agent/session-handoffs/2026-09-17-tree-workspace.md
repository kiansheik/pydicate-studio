# Tree workspace, full-passage AI and interpretation notebook

## Goal

Respond to actual use: make Árvore the primary compact editor, repair ambiguous partial translation, expose all active lexical dependencies with general/occurrence notes, carry PDF locations forward, make ground-truth saving explicit, and allow panes to move/collapse. Preserve all existing drafts and historical corpus files. Do not consume provider generation usage in routine verification.

## Files inspected

- Agent index, current-state, repo-map, open-questions and prior daily-use handoff; existing README and source/design contracts.
- `src/App.tsx`, `useStudio.ts`, authoring/runtime/AI/evidence domains, `RuntimeTree`, `AssistantPanel`, `SourcePane`, `PdfEvidence`, existing styling and hook/browser tests.
- Desktop worker/provider/context/evidence/usage services; Python adapter, concrete authoring, fresh runtime and authoritative reference operations.
- Read-only actual saved first-line AI request/context and copied draft profile; actual Araújo expressions, imported lexicon/composite/helper declarations, selected Pydicate classes and upstream `commit_ground_truth`/surface normalization.
- Memory registry pointers for authoritative annotated roles and source-expression versus saved-reference separation, rechecked against current code.

## Files changed

- `src/components/RuntimeTree.tsx`, `src/domain/runtime-tree.ts`, `src/runtime-tree.css`, `python/authoring_runtime.py`: exact source-occurrence provenance through deep copies, internal realization-copy classification, scoped tree editing and verified expansion, wheel zoom, safe stale selections, external lexical reveal, initial readable overview and final-write approval guard.
- `src/components/WorkspaceLayout.tsx`, `src/domain/workspace.ts`, `src/workspace.css`, `src/workbench.css`, `src/App.tsx`: persistent dock movement/swap/resize/collapse/maximize, stable mounted contents, tree default, compact surface comparison, source on right and narrow-screen navigation. Layout actions use existing categorical usage logging.
- `src/components/PassageLexicon.tsx`, `src/domain/passage-lexicon.ts`, `src/passage-lexicon.css`, `python/active_lexicon.py`, `electron/lexical-notes-service.cjs`: recursive dependency inventory, constructors/provenance, general versus contextual interpretations, durable history/version conflicts and project export.
- `src/components/AssistantPanel.tsx`, `src/domain/ai.ts`, `electron/provider-context.cjs`, `electron/provider-service.cjs`: explicit full-passage target, fresh evaluation provenance, optional partial scope, warning and acceptance restriction for ambiguous old partial output.
- `src/components/GroundTruthPanel.tsx`, `src/components/DraftArchive.tsx`, `src/useStudio.ts`: source-before-reference review, explicit full-form confirmation, locked approval transaction and durable success notice; searchable populated preserved drafts, including normalized-only text, with unchanged originals/export.
- `src/components/PdfEvidence.tsx`, `src/domain/evidence.ts`, `electron/evidence-service.cjs`, bounded `next-service.cjs` routing: earlier same-witness location inheritance into a working copy; own locations/drafts, deliberate clearing and replacement detection retain priority.
- `python/authoring_service.py`, `python/adapter.py`, `electron/next-service.cjs`, `electron/python-worker.cjs`: fresh active lexicon/full AI context, read-only reference status, notebook routing and runtime dependency fingerprinting.
- Focused domain, Python, Node and browser tests/harnesses; `scripts/smoke-next.mjs` adapted to current controls and isolated inspection worker. Native coverage reports/screenshots refreshed by tests.
- README, agent state/map/questions/log, design pages for active lexicon/AI scope/workspace+PDF, this handoff and the separate tree subtask handoff.

This continues the large existing uncommitted milestone in place; the full Git diff also contains earlier work. No commit or push was made.

## Commands run and evidence

- `npm run build`, `npm run format:check`, `git diff --check`.
- `npm test`: 34 domain tests passed. `npm run test:desktop`: 89 service assertions passed, including simulated providers and notebook/evidence persistence.
- `npm run test:python`: 62 tests passed in the complete adapter/authoring/inventory/runtime suite; includes all 82 Araújo surfaces, annotations and full grammar-shape parity.
- `npx playwright test --output /tmp/pydicate-workspace-final-e2e`: 45 scenarios passed in the final integrated browser suite, including new ground-truth concurrency and tree reveal regressions. All provider responses are simulated.
- `node scripts/smoke-next.mjs`: 11 native production workflows passed using disposable corpus/user data. See [native report](../../coverage/native-workflows.json). The ground-truth checkbox/save updated only the selected reference; every other row remained byte-identical. Actual historical source, lexicon and reference hashes remained unchanged.
- `node scripts/smoke-session.mjs '/Users/kian/Library/Application Support/pydicate-studio' --quick`: five representative passages (1, 2, 56, 67, 82) rendered in a copied real profile; two-session restart preserved all human fields, original draft IDs/revisions and local completion. Parse errors appeared in activity logs. Artifacts: `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-session-regression-JiZsgt`.
- Independent native lexical-note save/restart and final layout/reveal checks: [workspace report and screenshots](../../coverage/workspace-2026-09-17/report.json). Final renderer asset `index-Dlb-qdpV.js`; first-line overview renders six nodes/five relationships, all above the footer at 1512×950. All 12 lexical entries/14 uses are inventoried; explicit lexical reveal highlights and centers the exact occurrence. No renderer errors or corpus changes.

## What worked

- The saved AI request proved source data was not truncated: the complete expression/surface/12 direct lexical references were present, but the instruction targeted a prefix selection. Full-passage scope is now explicit at UI, backend, prompt and immutable provenance boundaries.
- Engine deep copies retain exact source provenance without changing realization, annotations or grammatical structure. Morphology copies can be hidden without merging legitimate repeated occurrences; three first-line `oré` occurrences remain distinct.
- Panes keep component instances mounted while moved/hidden. PDF inheritance preserves native page coordinates and asset identity and does not save a new manifest merely by navigating.
- General and occurrence interpretations remain separate from engine definitions/source metadata. Source shadowing, aliases and helper arguments retain identity; conditional dependencies are explicitly marked candidates.
- Reference saving compares the actual final upstream-rendered normalized surface to the human-reviewed surface before recovery/reference writes. A held approval locks editing/navigation; failure preserves the draft, and success persists completion only for the requested passage.

## What failed and was fixed

- Independent review reproduced an upstream approval callback returning a different surface from the earlier preview. The final-write sink now refuses it before touching either file.
- A stale runtime graph could emit a source path that now identified another constituent. Selection now requires a verified current span or falls back to full passage.
- Initial density left the tree clipped/root-only; compacted headers, expandable reference comparison, first-level minimum overview and reduced initial canvas height fixed the measured desktop case. External lexical selection also now expands ancestors and centers the chosen scope without feedback loops.
- Normalized-only archive drafts had content but blank/unsearchable previews. Their normalized text is now searchable and visible.
- The new concurrency regression reproduced a successful approval receipt disappearing during fast engine refresh. Resetting the receipt by passage instead of fingerprint fixes it.
- Old native harness assumptions broke after layout changes (source slider, closed catalog, PDF pointer geometry). Its inspection helper also replaced the live worker during evaluation. Updated selectors/geometry and a separate read-only inspection worker fixed the harness; no provider generation was needed.
- The old mobile browser test expected all panes simultaneously visible. It now verifies explicit narrow-screen pane navigation and no horizontal page overflow. Prettier found one new service-test file; formatted and rechecked.

## Remaining questions

- No fresh live AI generation was requested. Model-side completeness/linguistic quality is not claimed from simulated tests. Original partial AI output remains preserved and visibly qualified.
- Composite internals without exact source spans are inspectable, not freely mutable. Verified copied expansion and source-definition review remain the supported paths; arbitrary runtime drag rewiring is future work.
- Occurrence notes bind to expression/expansion identity. Changed expressions preserve old notes in the notebook instead of guessing a new binding. Cross-installation shared analytics/notebook synchronization is not implemented.
- Existing release limits remain: actual historical PDF validation, portable evidence export, packaged interpreter/installer and Claude billing.

## Suggested next prompt

“Use the local activity report and my next editing examples to refine Árvore's authoring ergonomics and operation coverage. Preserve source provenance and occurrence notes, inspect actual Pydicate capabilities before adding controls, and do not run live AI generation unless I explicitly request it.”
