# Canvas editing and local evaluation

The primary Árvore is a forest of exact Pydicate source expressions. The main expression supplies the passage result. Loose pieces belong to the same local draft, have independent source and evaluation, and do not enter the published passage until connected or chosen as its main result.

## Mouse and keyboard

- Right-click a predicate or operation for edit, duplicate, detach, remove, connect/swap, add operation and make-main actions. Shift-F10 opens the same menu.
- Drag a subtree onto blank space to move it. Drop onto an empty connection to move it there; drop one independent root onto another to choose a combining operator and operand order. Other unrelated nested subtrees swap their expressions; an explicit swap menu works for independent roots too. Ancestor/descendant swaps are rejected.
- Connection circles and the context-menu connection action provide click-based alternatives to dragging. Adding an operation creates an explicit empty connection when another operand is required.
- The canvas + opens a catalog of actual engine predicate constructors with Portuguese cards and editable fields, the shared rendered-Tupi picker (including unnamed subexpressions), or optional source entry. The catalog service constructs AST literals from fields and validates the resulting expression in the selected context.
- New passage shells default to bottom-up construction: inputs below, each operation/result above. The horizontal/bottom-up toolbar switch persists in the local draft and recomputes geometry without changing or reevaluating the source. Old drafts keep horizontal layout unless switched.
- Context menus offer variant selection and imperative chaining, in addition to the complete operation chooser.
- Reuse pieces through the shared rendered-Tupi picker, including previously authored unnamed subexpressions. Direct code entry remains available.
- Delete/Backspace removes the selected scope; Command/Ctrl-D duplicates it. Command/Ctrl-Z and Shift-Command/Ctrl-Z undo and redo. Editing text does not trigger canvas shortcuts.
- Drag the background to pan; use the focused wheel to zoom. Search, branch chevrons, overview, fullscreen and SVG export remain available. Detailed source editing is collapsed initially.

## Persistence and source fidelity

`Draft.canvas` stores detached expressions and node positions. Each structural gesture commits source and canvas together in one undo transaction. Context/drag actions bind their passage, revision and source; old gestures cannot modify a new passage or changed expression. Invalid text is retained and can be repaired or removed as a whole piece.

The renderer edits verified UTF-16 source spans. It preserves operation order, grouping and comments; evaluation belongs exclusively to the selected Python engine. Detached and removed operands become reserved `__studio_slot_<hex>` references when their parents need an operand. These draft-only placeholders have their own graph nodes and block source preview and reference approval. Loose fragments themselves are never silently published.

Persistence validates bounded fragment counts, source sizes and finite coordinates. Raw edits invalidate affected layout paths. Whole draft undo, autosave, explicit save and reopening retain the forest. Search also indexes successful stages from contextual loose pieces.

## Partial evaluation and diagnosis

Successful canonical evaluation is unchanged. For supported expressions whose construction or evaluation fails, the adapter evaluates branches independently and returns their source tree even without a final form. Each node distinguishes successful form, scalar value, direct error, dependency-blocked result and missing connection. Successful branches remain visible. A child that cannot render in isolation may still construct a valid object for a successful parent.

Loose expressions parse and evaluate asynchronously with bounded concurrency and a cache keyed to passage, grammar fingerprint and exact source. Layout-only changes reuse existing evidence. Stale evidence is rejected before display. The main expression's independent stage results arrive together in its evaluation response; this is not per-node streaming.

The diagnostic action opens a copy/export dialog with the exact expression, revision, selected node, successful steps, direct failures, dependency links, dispatch, operand types and actual engine traceback frames when available. It names the local grammar repository for a coding agent and distinguishes missing/invalid composition from a confirmed grammar defect. Preparing it does not call an AI provider or edit another repository. Translation and ground-truth approval require a complete main result.

## Current boundaries

Malformed Python syntax cannot supply a complete source tree; the raw repair card remains editable. Helpers and reused aliases retain their existing explicit expansion workflow. A connection expresses a Pydicate operation rather than proving linguistic validity. Loose pieces are local to the draft; portable multi-user draft/asset sharing remains separate work. Large draft collections still share the existing 1 MB contextual RPC limit.
