# Remove an operation and reconnect its child

## Goal

Remove one operation directly from the rendered tree, reconnecting its child to
the parent without detaching, deleting and reconnecting by hand. Preserve other
work, show the resulting form before confirmation and undo the change in one step.

## Files inspected

Required agent index/current-state/repo-map/open-questions; Canvas and contributor
contracts; `ExpressionCanvas`, `OperationPreview`, `TreeScopeEditor`; Canvas
transactions, expression-tree projection, authoring and inline-argument helpers;
Python source adapter and current browser/domain fixtures.

## Files changed

- `src/domain/operation-removal.ts`: eligible direct structural children, known
  method argument roles and comment preservation while deleting the operation.
- `src/domain/canvas.ts`: pure, source-bound `unwrap` transaction; promotes the
  chosen child and rescues other structural branches as loose pieces atomically.
- `src/components/ExpressionCanvas.tsx`: **Retirar só a operação…** context action,
  branch selector, exact engine preview, confirmation and context/focus guards.
- `src/domain/canvas.test.ts`: 13 regressions covering source, meanings, branches,
  supported shapes, freshness, comments and transaction atomicity.
- `tests/canvas.spec.ts`: six browser regressions for nested operations, branch
  selection/cancellation, meanings, loose trees, undo and delayed previews.
- Agent current state, log, repo map, Canvas contract, contributor guide and this
  handoff. All unrelated pre-existing changes were retained.

## Commands run and results

- `npx vitest run src/domain/canvas.test.ts src/domain/expression-tree.test.ts
  src/domain/inline-arguments.test.ts`: **61 passed** across three files.
- `npx playwright test --config /private/tmp/pydicate-meaning-canvas.config.ts
  tests/canvas.spec.ts --grep 'removing only|context-menu detach|keyboard duplication/removal'`:
  **8 passed**, 31.7 seconds, on frozen product sources. Includes six new removal
  cases and two existing detach/removal regressions; temporary Vite5181 stopped.
- `npm run typecheck && npx vite build`: **passed**. Existing large-chunk
  advisory remains; no generated learning build was run.
- Scoped `npx prettier --check` for the four changed product/domain files and
  `tests/canvas.spec.ts`, plus `git diff --check`: **passed**.
- Inspected `/private/tmp/pydicate-remove-operation-preview.png`: selected right
  branch, whole-tree form `toka tym`, readable dialog and visible confirm/cancel
  controls over the unchanged source tree. Screenshot uses the browser harness.

## What worked

Preview and confirmation share the exact immutable transaction and stable loose
fragment IDs. Nested operations preserve their parent's existing connection;
method settings such as `.var(1)` disappear with the operation, while structural
branches remain available. One undo restores the entire source/forest change.

The removed operation's own definition is discarded. The retained child's own
annotations remain; removing a negation therefore cannot transfer its negated
meaning onto the underlying word. Comments outside preserved child spans remain
once, while each retained/rescued branch keeps its exact source and comments.

## What failed or changed during verification

Review identified two edge cases before completion: a visible scalar operand
could be dropped and CR-only comment endings could absorb the following child.
Unsupported structural scalars now disable this action; comment scanning handles
CR, LF and CRLF and skips retained child spans. Regression tests cover both.

An early browser selector assumed a different branch label; it now selects the
actual **Lado direito · tym**. One run during concurrent source editing showed
the correct reconnected tree but reset browser-harness undo history; verification
was repeated with product files frozen to separate HMR from a product failure.
All eight cases passed in that final run, including the binary operation's
history count and exact one-step undo. No product change was needed for this.

## Remaining questions and limits

- The new action handles known unary/binary/comparison operations and documented
  method roles. Opaque helpers, constructors, unsupported/spread syntax and
  scalar structural operands do not offer an inferred child promotion.
- Existing **Remover trecho** still removes the selected subtree. The older
  detailed scope editor's keep-child controls retain their existing annotation
  behavior; this change applies to the new explicit operation-removal action.
- Browser checks exercise the actual local Python engine through fixture RPC;
  no packaged native-app interaction or live provider generation was performed.
- No real corpus or neighboring repository edits, generated learning rebuild,
  source publication, commits or pushes. Existing learning JSON changes remain
  24 additions/8 deletions.

## Suggested next prompt

“Remove a nested variant or negation with Retirar só a operação, inspect the
preview, and undo; then choose one branch of a binary operation to retain.”
