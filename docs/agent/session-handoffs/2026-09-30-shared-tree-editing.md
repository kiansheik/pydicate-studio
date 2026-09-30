# Shared tree editing and scoped repair — 2026-09-30

## Goal

Edit an imported variable such as `enosem` once for all references, and correct
grammar on an existing subtree or proposed replacement definition without first
building an entire passage. Preserve old examples through full-corpus checks.

## Files inspected

Required agent guides; reference inspector, canvas and operation previews;
authoring service/runtime, source publication and declaration resolution;
grammar-repair and analysis services; hosted invoke authorization; focused tests
and production smoke scripts. Read-only production AST inspection confirmed
`historic/lexicon.tu.py:262` defines `enosem = Verb("enosem")`.

## Files changed

- `python/shared_definition.py`, `authoring_service.py`, `authoring_runtime.py`:
  exact assignment target, declaration-prefix evaluation, candidate validation,
  RHS-only replacement and full-corpus preview. Existing guarded source apply
  retains publication identity, engine/source freshness and atomic recovery.
- `electron/next-service.cjs`, `python-worker.cjs`, `server/studio.cjs`: read and
  preview method dispatch/authorization.
- `electron/grammar-repair.cjs`, `analysis-service.cjs`: validated selected spans,
  proposed definition scope, enclosing/saved-tree checks and stricter readiness.
- `src/components/SharedTreeEditor.{tsx,css}`, `src/domain/shared-definition.ts`:
  separate editable canvas, tab draft storage/undo, explicit source review.
- ReferenceInspector, ExpressionCanvas, OperationPreview, TreeScopeEditor:
  nested declaration scope, repair callbacks and nested keyboard isolation.
- App, GrammarDiagnosticDialog, AnalysisSupport and diagnostic/analysis domains:
  target-specific form, requests, context and regression feedback.
- Python shared-definition tests, Electron repair tests, hosted policy tests;
  `tests/shared-tree-edit.spec.ts` and hook harness; agent map/state/log and
  `docs/design/node-interpretations.md`.
- Retained prior instant-capture handoff/state verification notes.

## Commands and results

- Eight shared-definition tests against the actual local engine/disposable corpus:
  passed, including nested shadows, stale source, unsafe candidates, changed
  corpus outputs and preserved parent references (about 62.5 seconds).
- Ten existing dictionary-definition tests: passed (about 23.9 seconds).
- Focused Electron repair/input tests: 26 passed, with additional scoped-note
  and detached-fragment guard checks. Local MCP transport only; no provider call.
- Hosted invoke policy test and CJS syntax checks: passed.
- Playwright: seven new shared-tree scenarios plus seven existing repair/scope
  scenarios passed across targeted runs. Covers explicit apply, selected spans,
  unsaved candidate restoration, stale responses, nested Delete/Undo, 800×600.
- `npm run typecheck`, `npm run build:app`: passed. Vite retains the existing
  large-chunk advisory.
- `npx vitest run src/domain/grammar-diagnostic.test.ts
  src/domain/grammar-regression.test.ts src/domain/analysis.test.ts`: ten passed.
- `git diff --check`: passed.

## What worked and what failed

Live `enosem` has the supported simple assignment shape. Real engine fixtures
exercise source semantics; mocked browser fixtures exercise scope, requests and
UI state rather than linguistic correctness. One initial browser assertion matched
two same-named buttons; narrowing it to the intended dialog passed. Final review
also removed the hosting-row exemption for detached-fragment repairs.

Shared definition previews reject changed existing surface/annotations, including
unapproved examples. Grammar repair rolls back newly introduced execution errors;
output-only changes remain explicit review findings and prevent clean readiness.
No real lexical definition or live AI conversation was changed during testing.

## Deployment and live verification

Pending light rollout of the existing `unlocked-light-deploy` PR #16 branch.

## Remaining questions

Definition drafts persist in this browser tab, not collaborative server storage.
Helpers, dynamic/multiple assignments and engine-owned names remain read-only.
Concurrent source changes require reloading the declaration before review.
No live AI generation or human linguistic acceptance is claimed by fixture tests.

## Suggested next prompt

Try `enosem` through Editar árvore compartilhada, build the intended tree, correct
its grammar if needed, then review the shared definition and corpus comparison.
