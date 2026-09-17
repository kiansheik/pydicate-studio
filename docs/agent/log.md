# Work log

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
