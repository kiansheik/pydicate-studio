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
