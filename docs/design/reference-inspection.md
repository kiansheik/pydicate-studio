# Shared reference inspection

The source AST still owns editable spans. A named value is not an empty object:
selecting it in `ExpressionCanvas` mounts `ReferenceInspector`, which asks the
selected engine context for `lexicon_inspect` and displays its `runtimeTree` with
the existing object-tree viewer. **Ver estrutura e usos** scrolls to this panel.
No source expansion, draft mutation, approval or undo entry occurs on inspection.
Object-tree relationships are not invented source operations. Explicit source
operations become editable after copying the occurrence.

The response includes declaration path/line/expression and `projectUses` from
read-only AST scanning of all historic sources. Bindings capture declaration
identity through compound/alias dependencies and later same-name rebindings.
Uses include source, ordinal, line, expression and intermediate names. These are
saved-code dependency candidates, not exhaustive dynamic execution or local-draft
usage counts. Parse/read diagnostics are shown instead of silently claiming full
coverage; arbitrary runtime mutation and helper-dependent binding remain limits.

`reference_expansion.occurrence_copy` checks declaration evaluation against the
current object's full runtime shape. A definition-only discrepancy can be retained
using an explicit `studio_define` wrapper, after another shape comparison. Other
mismatches disable copying. Compound/alias values expand recursively with cycle,
depth, node-count and output-size bounds; function call identifiers are not
rewritten into invented helper bodies. Each nested substitution and the resulting
whole copy must match the runtime shape. Failed deep expansion falls back to the
verified shallower expression. Constructors, lexical leaves and helper calls can
remain references. Thus copying a composition does not claim to freeze all future
changes to its lexical dependencies.

Copy confirmation replaces only the selected occurrence through the existing
bound canvas transaction and undo. Outer local definition wrappers and neighboring
source survive. Meaning-only edits use `node_definition` on the selected exact
scope; request identity, engine/revision and bound-source guards reject stale
results. Shared/source meanings use `lexicon_update` with `preserveGrammar` and
open the existing App diff/review flow. The inspector never calls `source_apply`.
Shared grammar changes are not auto-applied from an object-tree click: duplicate
and edit source operations locally, or use the project's source review tools.
