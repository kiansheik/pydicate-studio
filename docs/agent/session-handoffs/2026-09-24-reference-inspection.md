# Shared reference inspection and local tree copies

## Goal

For the passage containing `risetoheaven` and `rightsidegod`, expose the Pydicate
objects behind reference cards, show other uses and support meaning changes or
an editable occurrence copy without guessing shared impact.

## Files inspected

Required agent docs, canvas/source and runtime tree projection, TreeScopeEditor,
lexicon UI, authoring service/runtime, rendered structure isolation, source AST,
publication regression and targeted browser/Python tests. Read the actual Araújo
expression and shared declarations without editing neighboring repositories.

## Files changed

- New `ReferenceInspector.tsx`; App/RuntimeTree/ExpressionCanvas callback wiring
  and canvas CSS. Inspects automatically for selected references, offers an
  explicit jump to the inspector, graph, usage list, previewed copy and meanings.
- `authoring_runtime.py` enriches `lexicon_inspect` with runtime graph/project uses.
- New `reference_uses.py`: static cross-source dependency candidates with binding
  identity and parse diagnostics.
- New `reference_expansion.py`: verified recursive compound copying, including
  meaning-only divergence from the declaration, with explicit limits/fallback.
- Canvas browser harness/tests, runtime-tree expansion test and new reference-use
  tests; reference-inspection design, contributor guide, agent state/map/questions/log.

Earlier uncommitted passage-order/PDF work was retained intact.

## Commands / validation

- Focused browser canvas run: five checks passed covering object-tree display,
  usage listing, copy and undo, local meaning/unchanged rendered form, shared
  review without draft/source mutation, and existing operation/definition behavior.
- Additional delayed-reference-edit browser check: passed; navigating to another
  passage discards the pending meaning edit.
- `python3 -B -m unittest python.tests.test_reference_uses python.tests.test_runtime_tree.RuntimeProvenanceTests.test_occurrence_expansion_requires_actual_namespace_shape_equivalence python.tests.test_operation_tree.RealOperationTreeTests.test_reused_reference_only_gains_editable_inner_steps_after_verified_copy -v`: three passed.
- `npm run typecheck`, `npx vite build`, `git diff --check`: passed. Existing Vite
  large-chunk advisory remains. No generated-learning rebuild or provider requests.

## What worked

The actual `risetoheaven` object displays its internal nodes and grammar relations.
Nested named compositions can be copied into source operations while retaining
runtime shape and overridden meanings. Direct/transitive uses are shown across
sources; later lexical name rebinding does not falsely claim an earlier object.
Local meanings retain the same form; shared meanings request explicit review.
Undo restores the named reference. No real corpus or reference file was changed.

## Failures and limits

Early browser assertions needed scoping now that two tree viewers are present,
and the local definition assertion needed to allow preserved parentheses. Those
checks pass after correcting the selectors. Two test commands initially used
incorrect unittest method/class names; corrected targeted commands pass.

A broader RuntimeProvenanceTests run found existing shape-identity failures at
current Araújo ordinals 88 and 91. Loading `git show HEAD:python/authoring_runtime.py`
in memory and rerunning the same corpus-wide test reproduced both failures; they
are not introduced by reference inspection. No baseline assertion was weakened.

Usage counts are saved static dependency candidates, not dynamic helper execution
or local-draft coverage. Runtime internal nodes remain read-only until a verified
source copy is chosen. Copying may retain lexical/helper references; it does not
freeze the entire engine. Shared meaning edits reuse existing corpus regression;
shared grammar edits are not silently applied from runtime nodes.

## Remaining questions

Should dynamic helper dependency tracking and local-draft usage inventory be
added later? Current labels state the limits explicitly.

## Suggested next prompt

Restart Studio, select `risetoheaven` or `rightsidegod` in the cited passage, use
**Ver estrutura e usos**, then choose a local meaning or a verified occurrence
copy. Investigate the two pre-existing shape-identity test failures separately.
