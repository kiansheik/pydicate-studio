# Tree previews, node meanings and sole-root promotion

## Goal

Preview the rendered result while choosing a tree combination, operation,
variant or argument, before confirmation. Follow-up: defining an existing node's
meaning must not add another visible operation level, and a sole remaining loose
tree should automatically become principal when no primary expression exists.

## Files inspected

Required agent docs, Canvas/source-editing and dictionary/meaning contracts;
Canvas transactions, operation builders, scope editor, inline argument editing,
runtime/source graph projection, active lexical inventory, exact-node definition
and realization service contracts; existing model, domain and browser harnesses.
Selected-engine checks use the actual local adjacent corpus and grammar through
the existing bounded interpreter; no contributor source file is executed directly.

## Files changed

- New `src/components/OperationPreview.tsx` and CSS: read-only debounced local
  realization, immediate stale-output hiding, provenance checks and explicit
  empty/scalar/incomplete/error states.
- `src/components/ExpressionCanvas.tsx`: preview exact candidate transactions;
  argument selection and imperative confirmation; exact-node meaning edits;
  wrapper-aware inline argument targets; guarded saved-root promotion.
- `src/components/TreeScopeEditor.tsx`: previews for operation/operator, lexical
  reuse, expansion and raw replacement; closed-panel gating; exact inner-span
  edits preserve meaning annotations when changing/removing an operation.
- `src/domain/canvas.ts` and tests: pure sole-root promotion within a transaction,
  preserving nonempty primary work and ambiguous forests.
- `src/domain/expression-tree.ts`, `runtime-tree.ts`, graph tests: verified literal
  definition wrappers share their value's visible node, retaining outer source
  scope and inner operation source identity. Dynamic/helper calls remain visible.
- `python/active_lexicon.py`, `node_definitions.py`, active-lexicon and node-definition tests: matching
  visible inventory, stable genuine-node notes, inherited meanings and actual
  redefinition without stacking wrappers or changing constituent meanings.
- New `tests/operation-preview-{harness.html,harness.tsx}`,
  `operation-preview.spec.ts`, `tree-scope-preview.spec.ts`; updated
  `expression-tree-harness.tsx`, `canvas.spec.ts`, `composition-freshness.spec.ts`.
- Current state/log/map, contributor guide, Canvas/dictionary/node interpretation
  contracts, and this handoff.

## Commands run and results

- `npx playwright test --config /private/tmp/pydicate-operation-preview.config.ts
  tests/operation-preview.spec.ts`: **4 passed**, 9.4 seconds, simulated responses
  covering debounce, no mutations, stale/mismatched evidence, closed contexts
  and all result states. Fresh Vite5183 stopped.
- TreeScope run through `/private/tmp/pydicate-tree-scope-preview.config.ts`:
  **9 passed**, 21.7 seconds (four new preview/wrapper cases plus five existing
  editing/undo/literal/comment cases). Actual Python engine via browser fixture;
  fresh Vite5182 stopped.
- `npx vitest run src/domain/canvas.test.ts src/domain/model.test.ts`:
  **44 passed**. Updated two previous expectations for the requested automatic
  promotion, with new immutable promotion/ambiguity/source-preservation controls.
- `npx vitest run src/domain/expression-tree.test.ts
  src/domain/runtime-tree.test.ts src/domain/inline-arguments.test.ts`:
  **29 passed**. Covers wrapper projection, dynamic definitions, nested meanings,
  inline spans and stale source evidence.
- `npx playwright test --config /private/tmp/pydicate-meaning-canvas.config.ts
  tests/canvas.spec.ts tests/composition-freshness.spec.ts`: **49 passed** and two
  stale diagnostic button selectors failed. After correcting those selectors,
  the same config with `tests/canvas.spec.ts --grep 'partial evaluation keeps working sibling|a direct engine failure retains'`
  passed **2/2** in 3.8 seconds. **51 distinct Canvas/freshness cases pass**;
  final Vite5181 stopped. Total browser coverage including the runs above:
  **64 distinct cases**.
- `python3 -B -m unittest python.tests.test_active_lexicon
  python.tests.test_node_definitions`: **27/28 passed** initially (15 inventory
  cases and 13 definition cases). The new repeated nominal edit detected
  unnecessary added grouping around an existing definition wrapper. Fixed the
  exact-span update in `node_definitions.py`, then reran these five affected
  `python.tests.test_node_definitions.NodeDefinitionTests` methods with
  `python3 -B -m unittest`: `test_redefining_an_existing_nominal_changes_only_its_meaning_literal`,
  `test_keyword_override_can_be_replaced_and_removed_without_nesting`,
  `test_override_set_and_inherit_preserve_all_source_comments`,
  `test_repeated_leaf_override_changes_only_one_occurrence_and_can_be_replaced_or_removed`,
  `test_commented_positional_override_keeps_occurrence_comments_through_promotion`.
  **5/5 passed**, 42.5 seconds. All 28 distinct backend cases have passing results;
  the whole suite was not repeated after the narrow fix.
- `npm run typecheck && npx vite build`: **passed** on the integrated preview,
  wrapper and automatic-primary changes. Existing large-chunk advisory remains.
- Scoped Prettier and `git diff --check`: passed. Existing generated learning
  changes remain 24 additions/8 deletions; no learning regeneration was run.
- Inspected `/private/tmp/pydicate-tree-operation-preview.png`: actual combination
  dialog at desktop size, live engine form visible with confirm/cancel buttons,
  unchanged draft and loose piece before apply. The screenshot is a browser
  harness, not a claim of packaged native-app verification.

## What worked

Preview and apply use the same operation builder and immutable Canvas transaction,
including the full containing piece for nested changes and automatically promoted
combination results. Debounce/context checks prevent an earlier candidate's form
from appearing while a new one is evaluated. Preview requests never save drafts,
write source, approve references or invoke an AI provider.

Canvas and Léxico now share the exact-node meaning path. `studio_define` remains
portable source metadata while its value occupies the existing visible node.
Repeated meaning edits replace the existing annotation; internal definitions,
source comments, inline variants and undo remain intact. Inventory and graph
projection agree. Stored notebook records/history are untouched; obsolete
annotation-base-only rows remain historical instead of being heuristically
rebound to another node.

One remaining loose root becomes principal within ordinary structural edits,
including combining the last two loose pieces. A saved singleton is promoted once
after current parsing/evaluation evidence arrives, with an identity guard to avoid
immediately reversing an explicit undo. Any nonempty primary source, including
malformed/comment-only work, and multiple loose candidates stay intact.

## What failed or changed during verification

Initial browser fixtures assumed ungrouped source; exact source replacement
intentionally adds protective parentheses. Assertions were corrected. One chosen
operator actually fails in the current engine, so its preview regression checks
the explicit diagnostic instead of expecting an invented form. An intermediate
typecheck ran before the parallel TreeScope prop addition; final typecheck passes.
The first broad Canvas run was deliberately interrupted after the user added the
node-meaning and automatic-primary requirements; it is not counted as completed.
Two old browser selectors still used the former **Copiar diagnóstico** label;
they now use the existing **Corrigir gramática / árvore** action and retain all
diagnostic content assertions. A real backend regression exposed redundant
grouping when redefining an existing wrapper; the service now replaces that
verified call span without adding parentheses. New annotations and inheritance
removal retain their existing safe grouping rules.

## Remaining questions and limits

- Preview reports current engine behavior, not historical linguistic correctness.
  Immediate inline edits and drag/swap/removal gestures retain their existing
  undoable behavior; preview applies to the dialogs and detailed edit controls.
- Explicit saved node positions survive automatic promotion. Without explicit
  positions the primary tree can use its normal layout instead of the former
  loose fragment's implicit offset.
- The older `composition_define` API remains for compatibility, but the Canvas
  no longer exposes its automatic base-definition restoration checkbox.
- No real corpus publication, neighboring source edits, provider inference,
  generated learning rebuild, commits or pushes were made. Relaunch Studio to
  load the updated renderer and lexical inventory service.

## Suggested next prompt

“Try the live operation preview on a compound, redefine an intermediate node,
then combine the remaining loose trees and check the principal result and undo.”
