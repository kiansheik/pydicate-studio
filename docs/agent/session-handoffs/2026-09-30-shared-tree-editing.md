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

- Pushed and light-deployed `020f0ea195e8ce9eb6182f1bbd73ddb8eef3efd3` from
  existing PR #16 (`unlocked-light-deploy`). Main remains unchanged.
- Six rollout checks passed. New release healthy in 175.8 seconds; backup
  `20260930T133632-d74c55`. The image build exhausted the host disk, leaving a
  zero-byte idle temporary file and stale heartbeat. Pruned unused Docker build
  cache older than 24 hours, then one hour (4.335 + 2.8 GB reported reclaimed).
  Heartbeat recovered automatically; deployment continued without interrupting
  research work. Final disk availability: 5.3 GB, 93% used. Research files,
  backups and running/rollback images were not removed.
- Authenticated read-only `lexicon_inspect` and `lexicon_tree_evaluate` confirmed
  real `enosem` at lexicon line 262, `Verb("enosem")`, complete surface `enosem`.
- `.local/vps-qa/shared-tree-live.cjs` explicitly blocks source/draft/reference
  writes and AI starts. Fresh health: 153 lines / three sources, zero divergence
  and execution failures, 319 observed morpheme forms; 2.555 seconds, no active
  repair. Twenty-nine browser invokes returned without HTTP or page errors and
  with zero blocked mutation attempts.
- Actual live `enosem` editor opened with original expression, evaluated result,
  and enabled **Corrigir gramática desta árvore**. Screenshot:
  `.local/vps-qa/shared-tree-live.png` (private/ignored).
- Earlier smoke attempts raced initial tree hydration and selected an offscreen
  node, then incorrectly waited for every status element to disappear (the loaded
  inspector retains a runtime-tree status). Waiting for actual render readiness,
  selecting through visible search/keyboard and waiting for the exact loading
  message resolved the verification failures. No product change was needed.

## Remaining questions

Definition drafts persist in this browser tab, not collaborative server storage.
Helpers, dynamic/multiple assignments and engine-owned names remain read-only.
Concurrent source changes require reloading the declaration before review.
No live AI generation or human linguistic acceptance is claimed by fixture tests.
Host capacity remains finite; another large build should check available space.

## Suggested next prompt

Try `enosem` through Editar árvore compartilhada, build the intended tree, correct
its grammar if needed, then review the shared definition and corpus comparison.
