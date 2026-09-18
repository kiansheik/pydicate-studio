# Work log

## 2026-09-18 - Hidden Tupi → Pydicate laboratory

Implemented the planned experimental workspace on `codex/tupi-parser-lab`. The tab is absent until a persisted experimental switch reveals it, loads as a separate lazy chunk, reads state from the filesystem and starts its Python worker only on the first engine request. A bounded cascade retrieves recorded corpus expressions, composes declared grammar families over the normalized input and validates every proposal with the selected engine before calling it complete. Artifacts carry reproducible manifests and are invalidated by an engine change; jobs are cancellable and an interrupted job is recovered as interrupted. The small ranker trains, saves, reloads and is compared with the deterministic baseline.

The local sibling repositories are newer than the recorded baseline and clean, and the research probe runs against them unpatched; nothing in them was modified. Native Electron proof passed all eleven stages in an isolated profile against a disposable corpus copy: `asó xe rokype` and its case/space/punctuation variants all fold to `asoxerokype` and compose `(+ixé * só) + (pe * (ixé * oka))` with the engine's morpheme tags and the real editable tree; `zzzz` and `Açó xe rokîpe` stay unknown; `ereso nde rokype` composes although it is not a recorded expression; editing the possessor gives `asó nde rokype` with undo and redo; the corpus files are byte-identical.

Two findings are recorded rather than smoothed over. Removing a reserved lexeme or family from the index makes 25/25 held-out reconstructions return unknown, which is the declared generalization boundary. Of 88 training contrasts, 86 are symmetric ambiguities, so the ranker matches the baseline at 0.5 and is not recommended for activation. The ByT5 recipe is documented and dependency-checked but was not trained, and agent escalation was not invoked; both report their real state. Format, typecheck, build, 147 renderer, 197 desktop, 46 focused Python laboratory and 11 browser checks pass; no provider call was made. The repository-wide Python suite still ends with four failures and seven errors across six modules; a separate clean `main` worktree reproduces exactly the same set with the selected newer dependency revisions, and this branch changes no existing Python module, so they are pre-existing and were not worked around. See [contract](../design/parser-lab.md) and [handoff](session-handoffs/2026-09-18-parser-lab-implementation.md).

## 2026-09-18 - Custom-graph structural search research

Inspected Grew's OCaml matcher, corpus traversal, Python wrapper/backend and
local Grew-match launcher. Added a read-only exporter using Studio's existing
source adapter, 11 queries and 14 synthetic controls, a narrow native matcher,
and an optional actual-Grew binding comparison. Ran on the public historical
snapshot: 122 expressions, 1,895 nodes, all native fixture checks and 1,964 UTF-16
source-span checks passed, source hashes unchanged. System package installation
failed on unavailable user/group permissions; Grew remains unexecuted and the
report records that explicitly. No product/corpus changes or provider calls.
See [findings and integration assignment](../design/pydicate-structural-search.md)
and [handoff](session-handoffs/2026-09-18-structural-search.md).

## 2026-09-18 - Tutorial stage guidance and source-comment audit

Audited the existing learning workspace against the actual read-only authoring MCP: all 129 references agree and all five final lesson trees match approved Araújo expressions. Aligned each stage prompt with its own target, explained isolated arobiar and omission behavior, added visible stage navigation and evaluated feedback, a beginner roadmap and direct Referência entry. The library now extracts standalone Python comments and actual module/class/function docstrings from both engine and historic sources, with file/line attribution and strict metadata/link validation. Stale library reads use the existing one-refresh recovery path.

Production build, 15 focused domain/recovery checks, 11 Python curriculum/comment checks and all five browser scenarios pass across suite/focused runs. The added scenario builds lesson 1 through word search and mouse connections. Source/reference hashes remain unchanged; providers are simulated. An ambiguous reference-test selector was scoped to its result list. A focused rerun during simultaneous source generation correctly rejected a changing fingerprint; reruns use settled source files. Documentation explains source-comment authoring and partial-step contracts. See [handoff](session-handoffs/2026-09-18-learning-source-audit.md).
## 2026-09-18 - Tupi parser lab research branch

Audited current Studio at `8d21298c41ac5e5a66877b64ed96e02f00d31e56` and reused its documented dependency patches in disposable snapshots. Added a complete agent implementation assignment for a hidden Tupi → Pydicate lab, plus an executable offline probe and result artifact. The plan covers normalization and ambiguity, shared tree/code editing, bounded inverse search, original-expression synthetic targets, durable artifact jobs, an actual small ranker training path, optional neural/MCP proposals and leakage-controlled evaluation.

The probe recovered source expressions for 60/60 sampled combinations using 145 fragments and zero indexed full sentences, rendered `asó xe rokype`, and exercised a real source-span edit producing `asó nde rokype`. It also reproduced the existing decompiler's missing relational prefix and two real dictionary normalization collisions. These checks do not establish historical accuracy, model quality or native UI behavior. No product feature, sibling repository, corpus reference or provider state was changed. See [plan](../design/tupi-parser-lab-implementation.md) and [handoff](session-handoffs/2026-09-18-parser-lab-plan.md).

## 2026-09-18 - Guided practice and generated Portuguese reference

Mapped all current historical `.tu.py` sources and the shared lexicon, used the local read-only authoring MCP to verify both sources (89 Araújo, 40 Bettendorff records) and inspect/render the five selected examples with annotations. Added isolated guided practice using the existing tree editor, 24 source-comment guides, automatically indexed API/helper implementations and searchable corpus structures. `npm run build` regenerates the reference; changed lesson analyses or approvals require review. Questions carry only the lesson attempt into the existing explanation provider. No grammar, corpus, ground-truth or existing private drafts were edited.

Build, docs freshness, 134 domain, six worker, five Python and four real-engine browser tests passed, with 1440px/390px screenshot inspection and protected-file hashes. Initial browser probes accidentally reached an already-running different server; a dedicated non-reused test port fixed the test environment. Initial completion selectors matched the canvas zoom output too; the lesson status now has its own accessible name. Fixed clipped practice viewports. A sandboxed Vite cache write failed through the shared node_modules symlink; the approved build succeeded.

The user's follow-up about automatic variants/nominalization was investigated through read-only render probes. Default nominalization and variant 1 both render but differ (`oîo mombe'u` vs `nhemombe'u`), so no silent grammar fallback was introduced. See [handoff](session-handoffs/2026-09-18-guided-learning.md) and [maintaining docs](../design/learning.md).

## 2026-09-18 - Integrated grammar correction conversations

The correction dialog now starts from the current output and sends the edited form/notes directly to a new Codex conversation. Repair input is captured from the saved draft and selected grammar, with an automatic corpus baseline. Dedicated MCP grammar tools inspect existing files, apply unique hash-guarded replacements with before-image journals, refresh the engine and compare the unchanged expression and every corpus source. Ordinary jobs retain their scratch-only tools. Three conversations may run concurrently; one thread and one grammar directory each have only one active writer. Thread selection, follow-ups and delayed composer saves preserve their original context.

Verification: build/typecheck, eight domain tests, 47 desktop/MCP checks across focused runs, and 16 browser scenarios pass. Screenshots checked at 1440px and 720px. The real local engine/MCP probe found 89 passages and preserved source/reference hashes. No live AI generation or original grammar/corpus edits. General shell/write access was rejected by automatic approval review; the implemented alternative retains the Codex sandbox and exposes only grammar-specific checked tools. See [handoff](session-handoffs/2026-09-18-integrated-grammar-corrections.md).

## 2026-09-17 — Immediate tree adoption and local stale-proposal recovery

The preceding mendara proof bypassed `analysis_accept`; that service still rejected an old model fingerprint after Studio/runtime changes. Inspection now opens an undoable normal draft directly. Acceptance locally reevaluates exact source, preserves original evidence, and records current complete/partial/failed realization. Current disk revision/source identity checks remain; one same-command refresh handles a watcher lag without paid replay. Fixed saved-preview restoration marking itself complete before candidate details arrived.

Full copied-real-profile proof now includes the failing acceptance boundary: old mendara proposal accepted under current engine, repeat command idempotent, source preview names mendara, corpus regression128/127 passes,13 original files unchanged. Build,27 service/persistence,5 domain and22 browser checks pass across focused runs. No provider calls. See [handoff](session-handoffs/2026-09-17-inspect-local-recheck.md).

## 2026-09-17 — Review the visible noun proposal and edit translations

Resolved the empty-draft/visible-candidate mismatch behind the mendara syntax error. Explicit use-and-review actions now reach the exact accepted revision through every source-review entry point, with delayed-preview guards and an empty-tree diagnostic. Added an always editable human translation field plus same-run, revision-bound tentative proposal translations and explicit copy/replace actions.

The actual saved single noun produces `l += mendara` with a shared lexical entry; staged regression checked 128 expressions/127 references and preserved all 12 protected files. Build, Python (1), desktop/services (43), domain (5) and related browser scenarios (15) passed across focused runs. Initial browser failures were outdated selectors and a stale-preview test expecting the earlier rejection stage; updated to the current contracts. No real profile/corpus writes or paid requests. See [handoff](session-handoffs/2026-09-17-noun-review-translations.md).

## 2026-09-17 — Ordinary review repairs retained compound gloss

Fixed the gap in the previous compound workflow: the exact old draft now repairs during source_new_preview without composition_define. Whole-surface/exact dictionary sense evidence bounds the correction; custom meanings and mismatching analyses stay untouched. UI explains base/compound separation. Native proof used the actual retained draft with a temporary worker profile and found 127 evaluated rows, 126 matching references, and unchanged originals. Five new Python controls, three existing publication checks, the browser review scenario and build pass. See [handoff](session-handoffs/2026-09-17-legacy-composite-review.md).

## 2026-09-17 — Composite definitions and publication regression

Added node-scoped composite definitions, optional grammar-checked restoration of base meanings, named composite promotion and correct subsequent shared definition updates. Added staged corpus regression to every changed publication preview plus apply-time fingerprint guard and visible results. Native bridge produced `nhemoabare`, 127 evaluated rows and 126 matching saved references without changing originals. Fourteen lexical/publication scenarios pass across suite and corrected recovery rerun, plus browser definition/undo, 24 provider/scratch checks, 5 worker checks and build. See [handoff](session-handoffs/2026-09-17-composite-lexicon-regression.md).

## 2026-09-17 — Proposal tree editing and nominal output

Replaced proposal-only legacy tree with the full canvas, made bottom-up the default, retained preview-only layout gestures and routed structural edits through explicit acceptance plus revision-guarded draft edits. Added incomplete-surface notices and provider guidance for supported inflection/nominalization. Actual saved expression verified locally with and without `.var(1).base_nominal()`. Build, 13 workspace browser scenarios, one real-engine canvas scenario and 16 runner tests pass across the full run and focused rerun. No live inference or real draft writes. See [handoff](session-handoffs/2026-09-17-proposal-tree-editing.md).

## 2026-09-17 — Fresh AI conversations and readable history

Added Nova conversa with durable thread archival, empty provider chat context and original-thread routing for late results. Histórico separates old exchanges from the latest response. Repeated tool events are summarized, response fragments are joined, and raw logs are optional. Verified 14 service and 12 browser regressions plus build without live generation. Browser checks used an isolated server because the existing desktop dev server served stale UI. See [handoff](session-handoffs/2026-09-17-ai-chat-history.md).

## 2026-09-17 — Allow deliberate AI resubmission after a result

The user's repeated submit clicks created no new jobs: the renderer permanently reused the localStorage request ID for unchanged input, returning the old result. Submission identity now includes the latest matching terminal result, while active duplicate sends retain the same key. Applied to single and batch submission. The browser fixture now implements command deduplication, which previous tests omitted. Build and focused regression pass without paid inference; saved user data remains untouched. See [handoff](session-handoffs/2026-09-17-analysis-resubmission.md).
## 2026-09-17 — Codex code-mode host and complete MCP discovery

Diagnosed the user's saved zero-tool attempt without rerunning paid generation. Corrected disabled code-mode host for the actual code-mode-only model and first-page-only MCP discovery hiding evaluation/proposal tools. Added actual thread inventory preflight before `turn/start`; failed setup creates a blocked job rather than a linguistic question. A new installed-CLI regression uses a loopback fake model to reproduce the exact failure, reject incomplete tools without generation, and execute four real code-mode/MCP calls successfully. Build/typecheck and78 focused checks pass; no saved requests, corpus or user drafts were changed. See [handoff](session-handoffs/2026-09-17-codex-tool-transport.md).

## 2026-09-17 — Persistent AI authoring, shared MCP and source evidence

Implemented the attached milestone: Fonte/IA support pane, distinct tentative reading, awaited draft/evidence capture, durable conversations and bounded queue attempts, shared TypeScript authoring tools, authenticated external MCP, iterative Codex/Claude adapters, actual selected PDF crop pixels, independent proposed candidates and atomic explicit acceptance with undo. Human source/lexicon publication and ground-truth approval remain separate. The external CLI contacts the same main-process owner rather than editing application files.

Three independent critic rounds drove scope/reconstruction/evidence integrity, contributor workflow and retry/concurrency fixes. Publishing a pending passage now retains its history; old cancellation commands cannot cancel newer attempts; MCP clients have distinct request identities with explicit durable retries; accepted receipts survive later source/human changes without reapplying candidates. Native publication runs only in disposable corpus copies.

Build/typecheck, 129 domain, 167 desktop, 152 Python and 17 relevant browser checks pass, including actual process-kill recovery. The current real Araújo audit passes all 86 examples; six reconstruction and six assisted evaluation cases are checked in as unrun. Native Electron, external CLI/MCP, dictionary, evaluator, actual PDF pixels, acceptance/undo/restart and reviewed source publication pass with original hashes unchanged. Routine tests made zero paid requests. Codex scoped initialization and Claude model discovery succeed without inference; live linguistic usefulness and the earlier Claude billing limit remain unverified. Doctor reports drift against the preserved historical dependency baseline. Full commands, exact dirty dependency revisions, findings and limits: [handoff](session-handoffs/2026-09-17-ai-authoring-workflow.md).

## 2026-09-17 — Inline scalar call arguments

Folded number/string argument cards into call labels and added inline editing in the canvas. Click a value or double-click empty parentheses; blur/Enter saves and Escape cancels. Decimal commas normalize and text is quoted as data. Real predicate arguments remain branches, and exact source spans, comments, unchanged literal types, stale-gesture rejection and atomic undo are preserved for both main and loose pieces.

Build/typecheck, 43 domain checks and 52 related browser scenarios pass across the combined run and focused reruns. Two older tests were adapted to folded scalar arguments; a visual check found Enter focus loss, fixed and covered by immediate keyboard undo. Normal/narrow layouts were inspected. No provider calls or neighboring writes. See [handoff](session-handoffs/2026-09-17-inline-call-arguments.md).

## 2026-09-17 — Ground truth beside draft actions

Added **Commit to Ground Truth** beside verification and draft save. It opens the shared native reference dialog directly; the Review entry uses the same dialog. Removed the extra checkbox while retaining one explicit final save and existing source/reference validation. Cancellation does not preview/apply source or approve references; in-flight operations remain protected. Updated the affected smoke entry without rerunning the broad historical workflow.

Two focused browser regressions pass, covering the real App entry/cancellation and hook/component failure, dirty-source and concurrency behavior against a simulated backend. The final combined production build passes. Temporary screenshots show the footer and reference dialog. No AI calls or actual corpus writes. See [handoff](session-handoffs/2026-09-17-ground-truth-shortcut.md).

## 2026-09-17 — Named lexical publication and primary add field

New lexical constructor leaves now become shared named declarations during passage review, with exact-equivalent reuse and readable collision-safe names. The review opens with a nontechnical passage/word/field summary; exact names and both file diffs are behind **Mostrar diff técnico**. Both files are byte-checked, journaled and applied together. Failure tests verify rollback and interrupted-set recovery. The published draft adopts its named source, while definitions/verb senses and source operation structure remain intact.

Promoted add/reuse to the main toolbar, moved composition search secondary, removed redundant add buttons/bubble, and added visible-workspace **⌘K / Ctrl+K** focus/select-all. Constructor/code access remains secondary. Build, 11 planner, 32 service/source and the related browser checks pass. Native production testing confirms the human review/toggle, named publication with unchanged rendered form, keyboard insertion and undo; original source/reference hashes remain unchanged. See [handoff](session-handoffs/2026-09-17-named-publication-and-add-field.md). No provider calls, original corpus application, commit or push.

## 2026-09-17 — Direct canvas search and automatic freshness recovery

Moved the shared piece search into an always-visible textbox above the tree. Verified selections insert immediately; dropdown suggestions and dictionary choices remain compact overlays. Added click-away dismissal for floating editors, with synchronous cancellation of late insertions and unchanged canvas pan/select gestures.

Preserved service error codes across Electron and added bounded, coalesced read-only refresh/retry. Refresh preserves local text, forest, pending passages, notes, revisions, selection and undo, including typing while reload is pending. Actual source conflicts remain explicit; old candidate choices and source writes are not replayed. Fixed source application silently resolving during refresh. Build and focused domain/desktop/Python/browser checks pass; native production testing recovered from a changed disposable grammar and verified insert/undo without provider calls or original source changes. See [handoff](session-handoffs/2026-09-17-inline-search-recovery.md).

## 2026-09-17 — Inline dictionary and one piece search

Added the original local dictionary website as a persistent Studio mode, with exact-sense insertion and in-app source scans. Centralized piece creation around the existing natural lookup: reuse project structures first, then create from Navarro, with manual constructors/code still available. A shared converter/chooser preserves sense/class/definition, asks for ambiguous types and binds insertion to the current draft revision.

Read-only hosting adapts the actual site in memory; no generated/site source is edited. Dataset checksums and verified verbal identities avoid the discovered website/SQLite numbering mismatch. Build, 15 desktop, 11 Python, 34 browser and native production checks pass; original source/reference/site files are unchanged and no AI requests were made. See [handoff](session-handoffs/2026-09-17-dictionary.md).

## 2026-09-17 — One-click next passage and bottom-up building

Replaced the application entry to the separate new-reading modal with a selected empty shell in the ordinary passage/tree workspace. Added cumulative page/folio/section/subsection inheritance, editable source hierarchy, independent PDF guide shadows, persistent pending selection and reviewed migration. Publication follows the pending creation order; source comments retain explicit section/subsection changes.

Added an engine-backed predicate catalog/form palette, persistent vertical/horizontal layout, independent-root drag composition with operator/order choice, and quick variant/imperative chaining. Pending evaluation, lexical reads and assistant provenance use the real append context; provider tests are mocked. Build, focused domain/desktop/Python/browser checks and native disposable-profile verification pass. Original source/lexicon/reference bytes remain unchanged; no AI requests, neighboring edits, commits or pushes. See [handoff](session-handoffs/2026-09-17-next-passage.md).

## 2026-09-17 — Canvas editing and localized engine failures

Added source-faithful context menus, pointer moves/connections/swaps, keyboard actions, explicit empty connections and loose pieces that survive undo, save and reopening. The primary editor keeps its detailed controls collapsed and uses the shared rendered-Tupi picker for additions. Piece evidence is cached by context/source and layout moves do not reevaluate the main expression.

Supported failures now return successful independent stages alongside direct errors, blocked parents, missing connections and actual engine frames. Added a copy/export diagnostic for a local grammar-editing agent; partial results cannot be translated or approved as ground truth. Review corrected malformed-main repair, stale fragment evidence and focus/fullscreen transitions. Production native checks and focused regression results are in the [handoff](session-handoffs/2026-09-17-canvas-editor.md). No AI calls, corpus/reference or neighboring edits, commit or push.

## 2026-09-17 — Reuse structures by rendered Tupi

Added shared natural-spelling lookup to lexical insertion paths, including unnamed source/declaration steps and current local drafts. Search ignores whitespace, distinguishes exact and relaxed spelling, finds known portions of longer readings and preserves homographic structures as separate choices. Selection verifies the source structure in its destination namespace and safely expands conflicting aliases only when equivalence is proved. Code entry, exact-scope replacement and undo remain available.

The rebuildable local index contains 1,188 distinct candidates; all independently reproduce the recorded surface and structure. Cached queries avoid engine subprocesses. Eleven new Python tests, seven existing Python checks, two draft-context tests, desktop routing and 47 relevant browser scenarios pass. Final native production checks reused Araújo81's nine-node compound from spaced spelling, undid to the original, and rediscovered a changed draft after navigation/restart; source/lexicon/reference hashes are unchanged. No AI calls, neighboring edits, commit or push. See [handoff](session-handoffs/2026-09-17-rendered-reuse.md).

## 2026-09-17 — Intermediate realization and Portuguese operation guidance

Added the evaluated result to each operation connection and marked the root's canonical output as Resultado final. Step snapshots preserve pre-parent state and isolate mutable morphology caches; preview failures remain local and cannot invalidate a complete expression. Empty and scalar outputs are explicit, stale results disappear while parsing, and full forms remain available when inline labels are abbreviated. All 82 historical expression results/annotations/structures still match independent execution.

Replaced branch `+`/`−` controls with chevrons. Added a shared Portuguese operation map, names/help in the canvas/inspector/menus, and evidence-gated overload wording. Verified 35 domain, 36 browser and 22 Python tests plus native Araújo81 composition/results/undo/fullscreen/source preservation. No provider generation or corpus/neighbor edits. See [handoff](session-handoffs/2026-09-17-step-results.md).

## 2026-09-17 — Predicate nodes and source-operation connections

Corrected the primary authoring representation after the user's clarification: lexical references/values are cards, with compact editable operation junctions and ordered operand connections. The source AST preserves every intermediate operation that a realized `Classifier` can discard. Added left/right composition, operator change/swap/explicit removal, literals/optional method arguments, exact source search, and revision-safe editing even when realization fails. Fixed Electron's deny-all permission handler blocking native fullscreen, allowing only the current application main frame, and explicit Escape exit.

Tests cover actual Araújo81, incremental `tym` through `(pûera * (og * (emi * tym))) / ypy`, all 1,193 explicit source nodes across 82 expressions, preserved comments/UTF-16 spans, operation connections and fullscreen edits. No provider generation, corpus write, reference regeneration, commit or push. See [handoff](session-handoffs/2026-09-17-operation-tree.md).

## 2026-09-17 — Compound stem titles and lexical root metadata

Traced the user's annotated title to Araújo 81 and reproduced it directly in the selected engine. Fixed Studio's graph label presentation while retaining raw evidence, and fixed two sibling Pydicate composition paths that dropped the already-declared `ypy[ROOT]` metadata. Focused failing regressions now pass; the native title is plain and all 122 historical word forms remain unchanged. The strict JSONL audit still reports an unrelated pre-existing location-metadata mismatch at Araújo 74. Source/reference bytes were preserved. See [handoff](session-handoffs/2026-09-17-compound-annotations.md).

## 2026-09-17 — Tree-centered workspace and explicit passage scope

Made the evaluated tree the local default and connected exact occurrence edits, focused wheel zoom and lexical reveal. Distinguished engine morphology copies from semantic branches without merging distinct real objects. Added persistent movable/collapsible panes with the source on the right, recursive active lexicon and general/occurrence notebooks, sequential PDF-location inheritance, a compact preserved-draft archive and explicit ground-truth confirmation. Fixed full-line translation scope using the actual saved request as evidence; no provider generation was performed.

Independent review found and fixed a final-write rendered-surface mismatch guard, stale source selection, normalized-only archive visibility, a fast-approval success-message race, and unhelpful root-only initial tree overviews. Native production workflows passed in a disposable corpus, including reference approval with every other row byte-identical. Copied-profile checks preserved human fields/revisions across restart. Details and remaining boundaries are in the [workspace handoff](session-handoffs/2026-09-17-tree-workspace.md).

## 2026-09-16 — Initial Studio repository

Built the initial Electron/React reading desk from the supplied design brief and HTML inspiration. Implemented independent drafts, read-only local project opening, eight real-engine Araújo 0067 variants, shared selection, contribution export and session source consultation. Added a validated Python/desktop boundary, fresh evaluation fingerprints, draft recovery/undo, project-switch handling, documentation and CI.

Validated production build and formatting, 41 domain/service/adapter tests, 13 browser workflow/recovery tests, and a native production Electron smoke opening all 122 local historic passages and evaluating 0067. Current corpus includes two unsaved Araújo expressions. Existing references and neighboring repository contents were preserved.

Initial npm peer-version/DNS issues and inherited `ELECTRON_RUN_AS_NODE` were resolved. Patched the development-tool dependencies identified by the package advisory report. The clean engine/corpus installation gate, full authoring coverage, source write-back and editorial approval remain open; see [handoff](session-handoffs/2026-09-16-initial-studio.md).

## 2026-09-17 — General authoring, durable evidence and provider integration

Continued the initial application in place for the user's next-version implementation request. Defaulted to the current Araújo source, audited every expression and recorded the actual dirty engine/corpus baseline with reproducible patches. Added recursive bidirectional authoring, exact span edits, typed engine roles, project lexicon/helper editing, real Navarro search, persistent PDF evidence, independent reading-only new drafts, explicit source apply/recovery/reference review and Git patch export. Integrated Codex App Server and Claude Messages with isolated credentials and durable revision-bound provenance.

Independent critic rounds found and drove fixes for grouping drift, misleading coverage, lost runtime roles, lexical/helper inspection, duplicate IDs, source-note import, mandatory-analysis new passages, own-write warnings, metadata conflict visibility, multiline-source write-back, and malformed AI history. See [review reports](../reviews/) and the [handoff](session-handoffs/2026-09-17-next-working-studio.md) for final validation evidence and limits. These are separate fidelity, contributor-workflow and persistence/integration rounds, not repeated screenshot reviews.

The native production suite uses disposable corpus copies and temporary application state. Historical source, lexicon and reference bytes remain unchanged; neighboring Git statuses match the inspected starting state. No project commit, push or historical reference approval was performed. Claude's real generation check was rejected for insufficient credit; the critic's additional context-bearing generation was separately denied by automatic approval review. No simulated result is counted as a live provider connection.

## 2026-09-17 — Actual daily-use repairs

Diagnosed actual saved drafts and failed AI request, preserving originals. Fixed 69 old-format current drafts; native copied-profile checks rendered all 82 passages and preserved text/revisions across restart. Added local completion workflow, evaluated-object interactive SVG, precise cancellable Codex progress with explicit reasoning effort, and durable local activity/error reports. Independent review found and fixed undo/status, retry/result, refresh/adoption and telemetry races. Routine tests contain no live AI generation. See [handoff](session-handoffs/2026-09-17-daily-use-repairs.md).
2026-09-17: Added size suffix construction for Navarro augmentative/diminutive senses; exact dictionary selection creates `SizeSuffix` pieces, with focused engine and Studio tests. See [handoff](session-handoffs/2026-09-17-size-suffixes.md).
## 2026-09-17 — Grammar repair loop in Studio

Lifted the VS Code Tupy correction prompt into the tree inspector with intended surface, linguistic explanation, engine/tree scope and explicit grammar-navigation/MCP reload instructions. Added read-only full-corpus baseline and post-refresh comparison across all historic sources, including annotation and approved-reference changes. Real snapshot covered 89 Araújo and 40 Bettendorff lines. Focused domain/worker tests and build pass. See [handoff](session-handoffs/2026-09-17-grammar-repair-loop.md).
## 2026-09-18 — Grammar repair action beneath the main result

Moved discovery of the grammar repair loop to the main rendered result card, retaining the tree inspector entry. The action uses the current passage, draft expression, evaluated tree and failures. Build and formatting checks pass. See [handoff](session-handoffs/2026-09-18-main-result-repair-action.md).
