# Next passage workflow

`Adicionar próxima passagem` selects a new draft in the regular passage list and opens an empty Árvore. It does not create a PDF page or write the corpus. The last effective draft from the selected source supplies printed page/folio, textual line, section/subsection, optional prayer name, even if an earlier passage was selected. These are editable source locators; the textual line is copied literally without guessing an increment. Transcription, normalized reading, meaning/AI hints, translations, notes, analysis tree, owned PDF regions, completion and approval start empty. Repeated pending shells chain their predecessor and provisional ordinal; selection survives restart.

In Fonte, `Seção e localização` exposes scholarly page, folio, line, section, subsection and **Oração (opcional)**. Titles accept arbitrary text and offer existing titles. Changing section clears subsection. The physical PDF page remains independent and has an explicit next-page control. New and existing unmarked passages inherit the preceding view and its last box as a separate guide, with zero owned regions. An untouched cached initial viewport does not prevent a newly marked predecessor from supplying that guide; an edited view or saved region keeps its own state. Drawing/saving creates new evidence. Guide-only state never becomes a source evidence pointer. See [PDF contract](pdf-evidence.md).

The primary toolbar has a direct add/reuse textbox, with **⌘K / Ctrl+K** to focus and select its current query. **Tipos de peça e código** opens manual constructor cards from the selected engine's supported catalog. Required fields and optional properties follow actual signatures. Values become AST literals, including numeric/boolean fields. Draft pieces remain self-contained; source review promotes their lexical leaves into named shared definitions with collision handling and reviews both file diffs together. See [publication contract](lexical-publication.md).

New shells use bottom-up geometry: leaf inputs at the bottom, results above. The orientation controls preserve source and recompute layout; old drafts keep their previous horizontal default. Dragging independent roots onto each other opens a combining operator/order chooser; right-click offers ordinary operations, variant and imperative chaining. Empty connections, loose pieces, undo and intermediate failure evidence retain their existing semantics. See [canvas contract](canvas-editor.md).

Pending evaluation uses the namespace at its insertion anchor (or before the final collection alias for an appended passage); later declarations cannot leak into it. Lexical reads and assistant provenance identify the full local draft as pending. They do not invent a published row or accepted reference. No generation happens automatically.

**Inserir antes** and **Inserir depois** create a local draft beside the selected passage. A stable `beforePassageId` anchors placement, including chains of pending drafts; old drafts without an anchor still append. Publishing a later draft first reanchors earlier pending drafts to the new published identity. Existing passage IDs are pinned during insertion so duplicate expressions retain their drafts, evidence and approvals. Neighbors keep their expression and scholarly locators; unrepresentable inheritance changes block the preview.

**Continuar depois** saves the local draft and selects the following passage without approval or completion. **Concluir passagem** marks local workflow completion and selects the next passage in the visible filtered list; at the end it stays on the completed passage.

Forward navigation can also prefill only the locators of an entirely empty existing next passage in the same source. Any authored reading, tree, note, analysis instruction, detached piece, edited locator, workflow state or accepted reference preserves the target draft instead. Saved pending shells keep their own values. Passage-specific content is never copied; locators never cross sources or become an approval.

`Revisar nova passagem` shows the actual insertion and lexical declaration diffs using the reserved `passage:UUID`. Applying a revision-current diff migrates the local draft and preserves its canvas/evidence identity. **Registrar também como ground truth** defaults to checked: **Salvar fonte e ground truth** applies the diff and approves the reviewed surface using the new stable ID. Unchecking offers **Salvar somente a fonte** without approval or local completion. Passages can be published and approved independently of earlier unfinished passages. If reference approval fails, source publication remains saved and the reason is shown. Reopening an unchanged-source review retries only the reference.

Reference compatibility: `<source>.jsonl` retains the contiguous approved prefix expected by existing corpus tools. Approved records after the first gap live in portable `<source>.studio.json` version 1, keyed by `studio_passage_id` with current ordinals. Studio readers merge both; standalone legacy corpus tools see only the prefix. Filling gaps folds already-approved records back into the prefix without reapproving them. Insertion relocates ordinal/address fields without changing the reviewed surfaces. Both files participate in the recoverable transaction. No unreviewed placeholder records are manufactured.

Section/subsection directives round-trip through upstream comments; clearing subsection re-emits the active section. Upstream inheritance cannot represent clearing an inherited section; the draft is preserved and preview explains the limitation.

The optional prayer name round-trips as `prayerName` inside the existing `studio:v1` source note, not an unsupported upstream directive. It participates in scholarly source fingerprints and supports explicit clearing. Draft and hosted persistence retain it as `locators.prayerName`.

Current scope: catalogued sources, desktop and collaborative draft persistence, two scholarly hierarchy levels, optional prayer name, and the actual supported constructor/operation inventory. Arbitrary-depth section hierarchies remain future work. The original modal component is retained for legacy tests only; no application entry opens it.

The Fonte view ends with diplomatic transcription. It autosaves without starting AI.
Tentative reading, meaning, instructions, translations and normalized-target fields
are no longer shown there; existing stored values remain intact. Translation editing
is consolidated in the editor’s Tradução tab. AI submissions require an explicit
action in IA or a dedicated correction/translation request; Fonte has no
“Salvar e analisar” action.
