# Canvas editing and local evaluation

The primary Árvore is a forest of exact Pydicate source expressions. The main expression supplies the passage result. Loose pieces belong to the same local draft, have independent source and evaluation, and do not enter the published passage until connected or chosen as its main result.

## Mouse and keyboard

- Right-click a predicate or operation for edit, duplicate, detach, remove, connect/swap, add operation and make-main actions. Shift-F10 opens the same menu.
- **Retirar só a operação…** replaces an operation with a chosen child in its existing parent connection. The dialog previews the resulting piece before **Retirar operação**. Other structural branches become loose pieces and the whole change is one undo step. **Remover trecho** continues to remove the entire selected subtree.
- Drag a subtree onto blank space to move it. Drop onto an empty connection to move it there; drop one independent root onto another to choose a combining operator and operand order. Other unrelated nested subtrees swap their expressions; an explicit swap menu works for independent roots too. Ancestor/descendant swaps are rejected.
- Connection circles and the context-menu connection action provide click-based alternatives to dragging. Adding an operation accepts a selected argument or creates an explicit empty connection when a required operand is left blank.
- The primary add/reuse textbox finds rendered Tupi, including unnamed subexpressions. **Tipos de peça e código** opens the actual engine predicate catalog or source entry. The catalog service constructs AST literals from fields and validates the resulting expression in the selected context.
- New passage shells default to bottom-up construction: inputs below, each operation/result above. The horizontal/bottom-up toolbar switch persists in the local draft and recomputes geometry without changing or reevaluating the source. Old drafts keep horizontal layout unless switched.
- Context menus offer variant selection and imperative chaining through the operation preview dialog, in addition to the complete operation chooser.
- Number and string arguments stay inside their call label, such as `.var(1)`, rather than becoming child cards. Click an argument, or double-click an empty `()`, to edit it inline. Blur/Enter saves and Escape cancels. Decimal commas normalize to Python decimal points; other text is safely quoted as a string. Real predicate/expression inputs remain branches. Each argument edit is one undo step; unchanged values preserve spelling and type without adding history. Keywords, comments, grouping and loose-piece boundaries are preserved, and a changed passage/revision discards an unfinished field.
- Reuse pieces through the shared rendered-Tupi picker, including previously authored unnamed subexpressions. Direct code entry remains available.
- Delete/Backspace removes the selected scope; Command/Ctrl-D duplicates it. Command/Ctrl-Z and Shift-Command/Ctrl-Z undo and redo. Editing text does not trigger canvas shortcuts.
- Drag the background to pan; use the focused wheel to zoom. Search, branch chevrons, overview, fullscreen and SVG export remain available. Detailed source editing is collapsed initially.

## Preview before applying

**Combinar peças**, **Adicionar operação** and **Escolher variante…** display
**Prévia do resultado** before confirmation. Changing the operator, argument,
variant or operand order re-evaluates the proposed expression in the selected
engine. The imperative shortcut opens this same dialog. Required arguments may
remain empty for later connection; the preview then explains why there is no
complete form. Optional method arguments can also be supplied.

The preview and apply paths share the same source builder/Canvas transaction.
Previewing runs the transaction only on an in-memory copy and evaluates the exact
resulting piece, including its surrounding context for a nested selection.
Existing raw source, fragments, saved state and undo history change only when the
contributor applies the edit. Engine failure does not prevent retaining a partial
draft.

The detailed scope editor supplies equivalent previews for adding/changing an
operation, lexical replacement, copied expansion and raw replacement. Its result
is the whole containing piece after the scoped change. Closed edit sections do
not mount extra evaluators. Immediate inline edits and drag/swap/removal gestures
retain their existing undoable behavior.

`OperationPreview` debounces evaluation by 200 ms and hides old results immediately
when the proposal or context changes. Only engine results matching expression,
revision and the supplied engine identity can appear. Closing a dialog or
switching passage/context discards delayed responses. Empty surfaces, scalar
values, missing arguments, blocked results and errors remain distinguishable;
no form is inferred in the renderer. Preview uses only read-only local evaluation,
without provider generation or source/reference publication.

## Persistence and source fidelity

Operation removal binds the visible outer source node, including any literal
definition annotations on that node. It promotes the chosen structural child
without carrying the deleted operation's meaning onto it; definitions inside
the child remain intact. Method configuration values such as variant numbers
belong to the removed operation. Other structural branches are retained as loose
pieces. Comments outside retained child spans are preserved without treating
quoted `#` text as comments. Root, nested and loose-piece edits use the same
transaction and source guards; unsupported helper/constructor shapes do not
offer a guessed child promotion.

`Draft.canvas` stores detached expressions and node positions. Each structural gesture commits source and canvas together in one undo transaction. Context/drag actions bind their passage, revision and source; old gestures cannot modify a new passage or changed expression. Invalid text is retained and can be repaired or removed as a whole piece.

The renderer edits verified UTF-16 source spans. It preserves operation order, grouping and comments; evaluation belongs exclusively to the selected Python engine. Detached and removed operands become reserved `__studio_slot_<hex>` references when their parents need an operand. These draft-only placeholders have their own graph nodes and block source preview and reference approval. Loose fragments themselves are never silently published.

With an empty primary expression (or a bare reserved slot), a single nonempty
remaining loose root becomes the primary expression in the same transaction.
Combining the last two loose roots therefore produces the passage result with
one undo step. The same normalization applies to an existing saved singleton
after parsing, with a content guard that permits undoing that initial promotion.
Multiple candidates or any nonempty primary source, even malformed/comment-only
work, are preserved. Promotion retains exact fragment source, orientation and
explicit node positions; it never publishes or approves the passage.

Literal `studio_define` calls are portable meaning annotations. They are folded
onto their value's existing visible node while retaining the outer source scope
for whole-node editing and the inner source address for operation arguments.
Canvas **Definir significado do conjunto…** uses `node_definition`, just like
Léxico, so repeated edits replace the same annotation and preserve inner meanings.
They do not run the older automatic base-definition restoration workflow.

Persistence validates bounded fragment counts, source sizes and finite coordinates. Raw edits invalidate affected layout paths. Whole draft undo, autosave, explicit save and reopening retain the forest. Search also indexes successful stages from contextual loose pieces.

## Partial evaluation and diagnosis

Successful canonical evaluation is unchanged. For supported expressions whose construction or evaluation fails, the adapter evaluates branches independently and returns their source tree even without a final form. Each node distinguishes successful form, scalar value, direct error, dependency-blocked result and missing connection. Successful branches remain visible. A child that cannot render in isolation may still construct a valid object for a successful parent.

Loose expressions parse and evaluate asynchronously with bounded concurrency and a cache keyed to passage, grammar fingerprint and exact source. Layout-only changes reuse existing evidence. Stale evidence is rejected before display. The main expression's independent stage results arrive together in its evaluation response; this is not per-node streaming.

The diagnostic action opens a copy/export dialog with the exact expression, revision, selected node, successful steps, direct failures, dependency links, dispatch, operand types and actual engine traceback frames when available. It names the local grammar repository for a coding agent and distinguishes missing/invalid composition from a confirmed grammar defect. Preparing it does not call an AI provider or edit another repository. Translation and ground-truth approval require a complete main result.

## Current boundaries

Malformed Python syntax cannot supply a complete source tree; the raw repair card remains editable. Helpers and reused aliases retain their existing explicit expansion workflow. A connection expresses a Pydicate operation rather than proving linguistic validity. Loose pieces are local to the draft; portable multi-user draft/asset sharing remains separate work. Large draft collections still share the existing 1 MB contextual RPC limit.
