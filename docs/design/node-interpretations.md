# Meanings and notes at every tree node

Léxico lists the visible source tree in preorder, including the whole expression,
intermediate operations, constructors and repeated references. Each occurrence
has its own rendered form, exact source address and evidenced meaning. Expanded
declaration/helper dependencies follow separately; they are not additional
editable occurrences in the passage. Inline scalar arguments follow the canvas
visibility rules. Unresolved nodes remain available for notes.

`active_lexicon` preserves legacy lexical and occurrence identities while adding
construction entries, hierarchy and source/evaluation fields. Primary inventory
is bounded at 4,000 nodes; expansion limits and missing evidence are disclosed.
Inventory construction never executes source. The runtime supplies isolated,
revision-matched realization evidence and rejects stale projections.

## Definition editing

**Editar significado → Nesta ocorrência** calls `node_definition` with the full
draft, exact source node and revision/engine identity. The backend copies the
selected predicate through `studio_define`, replaces an existing local wrapper
instead of stacking it, and verifies unchanged isolated morphology and whole
passage surface/annotations. Empty meaning is an explicit unknown;
**Voltar ao significado herdado** removes only that local wrapper. The inherited
meaning remains separately inspectable when evidenced. Inner constituent meanings
and other repeated occurrences are preserved.

Canvas **Definir significado do conjunto…** uses this same exact-node operation.
Verified literal `studio_define` annotations share their value's visible tree
node instead of introducing another grammatical level. The outer source span
remains the definition/replacement target; operation edits use the evidenced
inner source span so inline variants and operator changes retain the meaning.
The Léxico inventory follows this visible projection; stored historical notebook
records remain intact.

**Consultar Navarro** supplies an exact dictionary sense to either the local or
general editor without replacing the subtree. Form citations show their context
separately; explicit meaning search can select the named entry's full definition.
The service re-resolves the dictionary identity and checks freshness around
preparation. Full selected meanings use the same source/publication/AI context
path as manually entered meanings. See the [dictionary contract](dictionary.md).

The returned expression enters the ordinary undoable draft. Source publication
uses the existing reviewed lexical planner, preserving distinct senses and their
nested meanings. Comments inside a promoted expression stay beside its reference
in the passage, rather than becoming generic commentary on the shared entry.
Positional and keyword local wrappers can be edited without dropping comments.
It does not mutate the original shared predicate in memory.

**Definição compartilhada / Definição nesta fonte** uses `lexicon_update` with a
real declaration target and opens the existing diff/affected-use review. The
meaning-only path sets `.definition` after construction, retaining constructor
class/pluriformity inferred from the original dictionary metadata. Pending
passages can prepare these previews. Shared edits target the effective final
declaration and its current override, not a superseded earlier assignment.
An anonymous construction has reusable
notebook notes, but no invented shared declaration. Expanded dependencies must
first be copied into the visible tree before a local definition edit.

## Shared tree editing

`TreeWorkspace` places the passage and shared definitions in tabs above the same
canvas area. **Abrir peça em aba** opens a reference directly; the inspector also
offers **Editar árvore compartilhada**. Both load the saved authored expression,
so operations such as `.var(1).copy()` remain editable even when the calculated
runtime object condenses them. The latter is a collapsed inspection detail.
Each mounted tab retains its own camera, selection and undo history. Closing a
tab retains its browser-session draft, including loose pieces. Hidden tabs pause
evaluation/inspection requests; shared morphology uses the declaration scope.
Shared tabs survive passage navigation; only the main passage canvas is replaced.
Each retains its originating passage/source context, including grammar correction
after another passage is selected. **Substituir por peça existente** offers named
linked reuse or an independent copied tree; both produce an undoable tab draft.
The active definition has its own review/repair controls, and the passage footer
indicates that shared editing is active. Review responses are bound to both the
expression and loose-piece state, so a changed draft cannot open an old review.

The reference inspector exposes `treeEdit` only for a named, simple assignment
in a corpus `.tu.py` file. It carries the original RHS, source fingerprint,
declaration identity, source ID and line. Helpers, multiple assignment targets
and engine-owned definitions explain why this editor is unavailable.

`lexicon_tree_evaluate` resolves shared names from the complete saved lexical
declaration graph, then evaluates an unsaved replacement with its dependency
closure in memory, returning the ordinary rendered tree and an independent
parsed `authoring` tree. A well-formed incomplete tree can return partial results
for further editing or a targeted grammar repair. The request retains `name`,
`expectedExpression`, `sourceFingerprint`, `declarationId`,
`declarationSourceId` and `declarationLine`; the prefixed coordinates are distinct
from the containing passage's source context. Nested `lexicon_inspect` requests
carry that descriptor as `definitionContext`, so a later passage-local binding
cannot silently replace the meaning of a referenced piece.

`lexicon_search` with `definitionContext` and `includeLaterDefinitions: true`
searches the complete shared lexicon; results include `treeEdit` and an explicit
`reuseBlockedReason` for unsupported or cyclic dependencies. Named reuse uses
`name.copy()` so the dependency is retained without leaking an alias's later
meaning override into the canonical object. A copied RHS instead retains its
constituent references. `definitionImports` reports the checked shared definitions.
Original AST coordinates remain in evaluation provenance. Cycles, ambiguous
rebinding and context-dependent helper/module effects fail explicitly; arbitrary
source-local imperative code is not treated as a reorderable lexical graph.

After a reviewed save, an open definition tab refreshes through
`lexicon_inspect.declarationTarget` using its name and original declaration
coordinates. This read-only lookup prefers the same binding at that line, or
requires a unique same-name binding when lines have shifted. Ambiguous rebinding
requires explicit selection. The returned fresh fingerprint is necessary for
later previews; refreshing never bypasses their exact-source guards.
`treeEdit.storageId` gives a uniquely declared name a stable tab/draft key when
earlier edits shift its line. Repeated module bindings retain their separate
line-bound identities; function-local variables do not count as rebindings.

`lexicon_tree_preview` validates the expression through the bounded interpreter,
replaces the selected assignment's RHS and serializes required shared declarations
in dependency order for Python compatibility. It preserves their comments,
identity notes and meaning overrides, and runs the complete corpus regression in a
disposable copy. It rejects incomplete trees and changed surfaces, references,
coverage or execution failures. Annotation-only changes in unchanged passages are
shown as before/after rows for shared-tree review; `source_apply` requires
`reviewedAnnotationChanges: true` for that exact stored preview. Other publication
modes retain their existing annotation guards. A successful preview is still read-only. Applying
the ordinary reviewed `source_apply` transaction checks exact source bytes and
the regression fingerprint, retains a recovery journal, and refreshes all
references without rewriting their variable names or approving references.

Grammar correction can target a selected subtree or an unsaved replacement
definition while preserving the containing passage as context. Each grammar edit
re-evaluates the identical saved target, its containing tree and the corpus;
publishing the replacement definition remains a separate explicit review.
See `python/tests/test_shared_definition.py` for actual-engine declaration scope,
cross-source regressions, stale guards and protected source bytes.

## Notebook identity and AI context

Meaning, grammar and other notes retain separate general and occurrence scopes
in the versioned project notebook. Canonical syntax plus lexical identity binds
general construction notes. A local subtree fingerprint plus semantic position
distinguishes repeated occurrences and survives formatting, unrelated sibling
edits and local literal definition wrappers. Changed node identities keep their
old notes as history; there is no surface-similarity reassociation. Legacy notes
require their exact old expression/occurrence identity until explicitly saved
under the stable identity. Pending/published passage prefixes are canonicalized.

Before a new prompt or analysis submission, the renderer flushes pending note
edits. A save failure stops submission. Editing notes immediately invalidates a
visible prompt preview. An unmounted editor's in-flight save remains registered
until successful completion; failed writes remain retryable and block capture.
Reopening the same note shares the pending version and newest fields, so moving
from Léxico to Traduzir cannot omit the last edit. Note edits during asynchronous
translation acceptance also prevent applying the older reading into the draft.

`electron/interpretation-context.cjs` projects only currently bound notes into
translation, ordinary analysis, candidate evaluation and explicit grammar repair.
Constituent requests filter by trusted source spans. Context retains note version,
scope, original definition, explicit source definition and effective reading.
Priority is occurrence meaning, explicit source definition, general meaning,
then evidenced engine meaning. Missing realization of an explicit definition is
reported instead of silently substituting an inherited general note. Grammar
notes remain contributor observations; conflicting evidence stays visible.

Analysis jobs privately freeze the latest notebook records and reproject them
against candidates. Resume uses that original snapshot; a new submission captures
new notes. Reconstruction inputs withhold both the catalog and projected notes.
Submission identity includes a deterministic hash of applicable saved note
versions, including batches and repair retries. A deliberate new send with changed
notes cannot silently return an older queued job; unchanged retries stay idempotent.
The private catalog never enters ordinary model input, job lists or events.
Translation acceptance rejects changes to relevant scoped notes. Unrelated notes
do not invalidate a result. Bounds are 10,000 records/4 MiB privately and
200 bindings/200 KB in model context, with explicit truncation diagnostics.

Notebook notes remain local application data with version history/export.
Definitions explicitly published through source review are portable source data.
Neither notes nor matching engine forms establish historical attestation. The
neighboring engine's standalone prompt API is unchanged.

See `python/tests/test_{active_lexicon,node_definitions}.py`,
`electron/tests/{interpretation-context,translation-context}.test.cjs` and
`tests/passage-lexicon.spec.ts` for the contracts and actual-engine sense test.
