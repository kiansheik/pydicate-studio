# Shared pieces in main tree tabs — 2026-09-30

## Goal

Open an imported shared piece inside the main tree workspace, edit its authored
operations and variants with the normal canvas, and switch back to the passage
without losing work. Investigate `enosem` inside `imomiaûsupyrarenosema`.

## Files inspected

Required agent guides; App, RuntimeTree, ExpressionCanvas, ReferenceInspector,
SharedTreeEditor, morphology hook and shared-definition domain; Python declaration
inspection/evaluation and publication guards; browser and actual-engine tests;
production AST/read-only evaluation and the existing live smoke script.

Read-only production inspection identifies Araújo ordinal 112 and
`historic/lexicon.tu.py:565`: `enosem_26169d1f = (((ero) * (sem)).var(1)).copy()`.
The variant remains in the source/authoring AST. It is condensed in the runtime
object. This is a different definition from the older literal `enosem` at line262.

## Files changed

- New `src/components/TreeWorkspace.{tsx,css}`: main editor tabs, accessible
  keyboard navigation, sticky tab strip, exact refresh and guarded deduplication.
- RuntimeTree, ExpressionCanvas, ReferenceInspector: direct reference tab entry,
  runtime-object graph folded into inspection details, pause hidden-tab reads.
- SharedTreeEditor: session drafts with stable identity, independent camera/undo,
  source-refresh reconciliation, toolbar above canvas, loose-piece review guards.
- App: active shared-definition footer and passage-result label; refresh tabs
  after source application. `useMorphemeTrace`: exact definition-scoped evaluation.
- `src/domain/shared-definition.ts`: shared tab/target types.
- `python/authoring_service.py`, `shared_definition.py`: exact declaration refresh
  and stable unique-binding storage identity; ambiguous rebindings remain guarded.
- Python shared-definition, expression-tree domain and browser shared-tree tests;
  agent state/log/map and node-interpretation design documentation.

## Commands and results

- Ten actual-engine shared-definition tests passed (79.7s), including published
  `.var(1).copy()` reopening and exact target refresh with passage shadows.
- Two stable-identity tests and the actual-engine save/line-shift/shadow refresh
  test passed after the identity change. The full Python suite was not rerun.
- `npx vitest run src/domain/expression-tree.test.ts
  src/domain/inline-arguments.test.ts src/domain/runtime-tree.test.ts`: 30 passed.
- `npx vitest run src/domain/expression-tree.test.ts
  src/domain/grammar-diagnostic.test.ts src/domain/grammar-regression.test.ts
  src/domain/analysis.test.ts`: 23 passed (overlaps the preceding run).
- `npx playwright test tests/shared-tree-edit.spec.ts`: ten passed (26.7s),
  covering variant editing, tab camera/undo retention, publication and scoped
  morphology, close/reopen, loose-piece preview invalidation and 800×600.
- Final focused `--grep '800 by 600|definition tabs retain'`: two passed (8.2s).
  Checks sticky-tab physical hit targets and draft restoration after a simulated
  declaration line/ID/fingerprint shift. Screenshot inspected.
- `npm run typecheck`, `npm run build:app`: passed. Existing large-bundle advisory.
- `git diff --check`: passed before final documentation edits.
- Production preflight: 5.3GB available, 93% used. No cleanup performed this turn.

## What worked and what failed

The authored AST already retains variant arguments and spans, so the fix exposes
the normal editor instead of reconstructing operations from calculated objects.
Review found two real problems now covered: shared morphology used passage scope,
and a newly added loose piece could leave an old preview eligible for display.
Initial browser tests needed an explicit Ajustar after changing a raw expression,
because the editor correctly preserves the user's previous camera.

No production research definition, draft, reference or AI job was changed during
the investigation. Local browser tests use mocked engine responses; Python tests
use the actual local engine in disposable corpus copies. Their limits differ.

## Deployment and live verification

Pending authorized light deployment and authenticated, read-only verification of
the actual published compound, its variant input and tab switching.

## Remaining questions

Tabs currently open named shared definitions. Anonymous-operation subtree repair
remains available in the selected-piece controls. Closed-tab drafts are stored
for the browser session, not synchronized as server research drafts.

## Suggested next prompt

Verify the deployed `enosem_26169d1f` tab and variant editing in everyday use, then
evaluate whether anonymous subtree tabs also improve longer passage workflows.
