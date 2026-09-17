# Repository map

## Contributor application

- `src/App.tsx`: passage navigation, reading/analysis/review/lexicon/AI modes, theme, pane resizing, explicit source/Git/reference review, metadata conflict comparison and pending-reading navigation.
- `src/useStudio.ts`: draft envelopes, selected pending shells with predecessor/order metadata, per-project undo/redo, revision-bound parsing/evaluation, source preview/apply, explicit reconciliation and session restoration.
- `src/components/AuthoringEditor.tsx`: recursive typed construction cards, scope edits, editable raw text, lexical selection, helper parameters/templates and explicit lexical edit scopes.
- `src/domain/next-page.ts`: same-page cumulative locators and pending-shell projection into ordinary navigation; `SourcePane.tsx` edits section/subsection. `NewPassageDialog.tsx` remains only for legacy regression fixtures; App no longer opens it.
- `src/components/PdfEvidence.tsx`, `src/domain/evidence.ts`, `src/evidence.css`: actual PDF.js canvas/worker, native page-coordinate regions, zoom/rotation and recoverable unsaved evidence.
- `src/components/AssistantPanel.tsx`, `src/domain/ai.ts`: provider state, streamed candidates, revision checks and explicit human acceptance.
- `src/components/SourcePane.tsx`, `SourceRecovery.tsx`: source-adjacent scholarly fields and explicit recovery previews.
- `src/domain/project-recovery.ts`: coded service-error normalization and bounded browse-only retry through `useStudio`'s coalesced project refresh. Refresh preserves current local edits and never replays source writes or selected insertion choices.
- `src/domain/model.ts`, `types.ts`, `authoring.ts`: draft validation, source/reference separation, UTF-16 replacement, projection contracts and exact revision checks.
- `src/domain/example*`, `render-snapshots.json`, `PhraseEditor.tsx`: retained browser-only initial example, clearly distinct from live desktop authoring.
- `src/styles.css`, `authoring.css`, `theme.css`, `assistant.css`: source-centered reading desk, dark default/light option, nested scope and task-specific controls. PDF colors are not inverted.

- `src/components/ExpressionCanvas.tsx`, `src/expression-canvas.css`: primary source forest, context menus, pointer/keyboard connection actions, loose-piece evaluation, compact inspector and fullscreen editing. `RuntimeTree.tsx` routes draft-aware views here and retains the legacy read-only/example viewers.
- `src/domain/canvas.ts`: validated forest schema, bound source addresses, atomic detach/duplicate/remove/connect/combine/swap/make-main transactions and exact source edits. `tests/canvas.spec.ts` exercises the real draft-aware component; canvas/model and desktop validation/store tests cover persistence.
- `src/components/PredicatePalette.tsx`, `src/domain/canvas-layout.ts`: actual engine constructor cards/forms and persistent bottom-up/horizontal geometry. `python/tests/test_pending_authoring.py` covers pending append contexts, constructor argument validation and hierarchy round-trips. `tests/next-passage.spec.ts` covers the actual App shell and revision-bound publication order.
- `src/domain/grammar-diagnostic.ts`, `src/components/GrammarDiagnosticDialog.tsx`: local-engine diagnosis and copy/export handoff, including successful steps and actual failure frames; no automatic provider invocation.
- `src/components/RuntimeTree.tsx`: main `PydicateTree` source projection with predicate cards and selectable operation connections; shared SVG camera/search/collapse/fullscreen/export also retains the older `RuntimeTree` evaluated-object viewer.
- `src/domain/expression-tree.ts`, `tree-operations.ts`, `src/components/TreeScopeEditor.tsx`, `src/tree-scope-editor.css`: exact AST-to-graph spans, stale evidence rejection, ordered operation composition/modification, comment preservation, literals and verified copied lexical expansion.
- `src/domain/runtime-tree.ts`, `src/runtime-tree.css`: shared graph geometry with compact operation junctions, focused wheel zoom, exact source mapping and occurrence-aware source search; evaluated-object projection still separates internal morphology copies.
- `src/domain/operation-terms.ts`, `docs/design/operation-terms.md`: shared Portuguese operation names/explanations, with evidence-gated overload labels and stable underlying DSL keys.
- `NodeEvaluation` in `domain/authoring.ts`, expression projection and runtime-tree preview helpers: revision-checked intermediate forms, full selected results, explicit empty/value/unavailable states, Unicode-safe display wrapping and layout bounds.
- `src/components/WorkspaceLayout.tsx`, `src/domain/workspace.ts`, `src/workspace.css`, `src/workbench.css`: persistent dock positions/sizes, stable mounted panes, compact primary editor and narrow-screen pane navigation.
- `src/components/PassageLexicon.tsx`, `src/domain/passage-lexicon.ts`, `src/passage-lexicon.css`: recursive active inventory, general/occurrence interpretation notes and project notebook export.
- `src/components/SourceReviewContent.tsx`: default human review summaries, revision-matched draft output, compact definitions/field changes and optional exact technical diffs.
- `src/components/GroundTruthPanel.tsx`, `DraftArchive.tsx`: source-before-reference confirmation and searchable preserved-draft recovery.
- `src/components/DictionaryTab.tsx`, `dictionary-tab.css`: persistent local-site iframe, explicit refresh and strict selected-entry messaging. `DictionaryEntryCreation.tsx` shares exact-sense/constructor/partial-result handling with the piece palette.
- `src/components/PieceSearch.tsx`, `PredicatePalette.tsx`, `LexicalInput.tsx`: shared natural search, direct inline canvas insertion, reuse-first ordering, Navarro fallback, retained queries, stale-choice invalidation and secondary manual constructor/code entry. `useStudio.insertPiece` preserves the main tree and provides one-step undo for inserted loose pieces.
- `src/components/UsagePanel.tsx`, `src/domain/usage.ts`: local activity report/export and categorical renderer event/edit-batch recording.

## Desktop and Python

- `electron/main.cjs`, `preload.cjs`, `next-service.cjs`: isolated application origin, sender validation, explicit IPC methods, active project, session and service integration; bounded write-only clipboard action for explicit diagnostic copying.
- `electron/service-errors.cjs` plus `preload.cjs`: bounded error-only transport retaining service codes across IPC/contextBridge without changing successful values.
- `electron/python-worker.cjs`, `validation.cjs`, `draft-store.cjs`, `project-watch.cjs`: bounded worker lifecycle, atomic draft storage, write-event suppression and external changes.
- `electron/evidence-service.cjs`: managed PDF assets, manifests and optimistic persistence.
- `electron/lexical-notes-service.cjs`: versioned project interpretation notebook with atomic persistence, conflict checks and history/export.
- `electron/provider-{service,codex,claude,rpc,context}.cjs`: main-process transports, durable validated history, provenance, cancellation and read-only MCP context.
- `python/adapter.py`, `worker.py`: source imports, actual repository/content fingerprints, stable identity reconciliation and JSONL dispatch.
- `python/studio_authoring.py`: concrete spans, recursive syntax/capability adapter and authoritative upstream comment parsing.
- `python/lexical_publication.py`: read-only literal predicate promotion, exact-identity reuse, deterministic headword naming/collisions, and engine evidence preservation; runtime child action feeds reviewed source publication.
- `python/reviewed_files.py`: staged multi-file writes, durable before/after recovery journal, byte guards and reverse rollback; `authoring_service.py` builds both diffs and supports mixed interruption recovery.
- `python/authoring_service.py`: explicit source/lexicon edits, preview/stale/recovery protocol, verification, reference acceptance and Git patch preparation.
- `python/authoring_runtime.py`: fresh selected-engine context, bounded contributor expression interpretation, isolated per-step evaluation snapshots, partial branch realization and engine-frame diagnostics, typed roles, lexical/helper introspection and authoritative approval sink.
- `python/navarro_search.py`: actual NavarroDB/SQLite headword and Portuguese search, distinct sense identities and provenance.
- `python/active_lexicon.py`: recursive source dependency inventory with argument binding, declaration identity, primitive constructors and explicit candidate/helper limits.

- `electron/dictionary-site.cjs`, `electron/dictionary/`: read-only isolated host, bounded real assets, in-memory site instrumentation, exact row/checksum bridge and local citation overlay. `python/navarro_search.py` supplies website-gzip lookup/identity separately from older SQLite search; runtime/service implement `dictionary_predicate`.
- `electron/usage-service.cjs`: durable rotating JSONL sessions, build/request correlation, sanitized categorical events and read-only reports.
- `electron/application-permissions.cjs`: fullscreen permission restricted to the current application main frame; all other permissions remain denied.

## Verification and documentation

- `python/audit_araujo.py`: complete source/engine comparison matrix; imports matching independent UI evidence only when source hash and expression match.
- `scripts/check-project.py`, `docs/design/dependencies.md`, `next-baseline.json`, `dependency-patches/`: reproducible dirty dependency baseline and read-only startup check.
- `scripts/smoke-next.mjs`: production Electron workflows with temporary user data and disposable corpus copies. `smoke-desktop.mjs` preserves the original example smoke.
- `scripts/critic-*`, `tests/critic-ai-restart.test.cjs`, `docs/reviews/`: independent fidelity, contributor and persistence reviews plus reproducible probes.
- `tests/authoring-sync.spec.ts`, `next-hook-harness.*`: explicitly simulated delayed-response/conflict/draft contracts. `tests/pdf-*`: actual PDF.js rendering and persistent service workflows.
- `python/tests/`, `electron/tests/`, `src/domain/*.test.ts`, remaining `tests/*.spec.ts`: focused corpus, desktop, domain and original example regressions.
- `docs/design/`: supplied brief, architecture contracts and historical initial inventory. `docs/coverage/`: machine/readable coverage, dictionary/provider/native evidence and screenshots.
- `docs/agent/`: compiled current state, log, remaining questions and session handoffs; code/tests remain authoritative.

Language realization belongs to the selected Python engine. The renderer edits structure and preserves source; it never implements Tupi morphology in TypeScript.

Rendered reuse: `python/rendered_structures.py` indexes source/declaration/draft steps and verifies portable insertion; `authoring_service.py` owns cache/freshness RPCs. `src/components/LexicalInput.tsx` is the shared natural picker; `src/domain/structure-drafts.ts` supplies current contextual drafts at request time. See [contract](../design/rendered-reuse.md), `python/tests/test_rendered_structures.py`, and `tests/rendered-lookup.spec.ts`.

- `scripts/smoke-session.mjs`: old-format or copied-profile rendering, completion/restart and usage regression; `scripts/usage-report.cjs`: read-only activity analysis with a seven-day default.
