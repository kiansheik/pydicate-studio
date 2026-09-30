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

- Committed/pushed and light-deployed
  `e5852d84fb0f0256a4548f02fab844942af9a77c` on existing PR #16.
  `STUDIO_REF=unlocked-light-deploy make collab-deploy-light` completed healthy
  in 54.6 seconds; six rollout checks passed. Backup: `20260930T141439-3903b1`.
- Read-only SSH checks confirm current release, healthy running image, bundled
  tab label and exact-declaration refresh backend. Disk: 4.0GB available, 95% used;
  no production cleanup performed. Check capacity before another image build.
- `.local/vps-qa/shared-tree-tabs-live.cjs` (private/ignored) passed with hard
  assertions and explicit source/draft/reference/AI-write blocking. It opened
  Araújo ordinal 112, selected `enosem_26169d1f` and opened its main workspace tab.
  Authored `.copy()` and `.var(1)` nodes were present; the inline variant editor
  contained `1` and was canceled with Escape. Switching to the passage/back and
  closing/reopening retained the exact expression; grammar repair was enabled.
- Fresh corpus health: three sources, 153 lines, zero divergences/failures,
  six pending drafts, 319 observed morpheme forms; 2.573 seconds, no active repairs.
  Thirty-six authenticated invokes had zero HTTP, invoke or page errors and zero
  blocked mutation attempts. Original session selection restored and verified.
- Screenshot `.local/vps-qa/shared-tree-tabs-live.png` inspected: authored
  copy → var(1) → ero * sem visible in the ordinary editor. Research was not
  edited and no real AI repair was invoked by this smoke.

## Remaining questions

Tabs currently open named shared definitions. Anonymous-operation subtree repair
remains available in the selected-piece controls. Closed-tab drafts are stored
for the browser session, not synchronized as server research drafts.

## Suggested next prompt

Verify the deployed `enosem_26169d1f` tab and variant editing in everyday use, then
evaluate whether anonymous subtree tabs also improve longer passage workflows.
