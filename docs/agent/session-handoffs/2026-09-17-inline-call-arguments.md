# Inline call argument editing

## Goal

Keep simple function/method parameters inside the operation label, e.g. `.var(1)`. Let contributors click a value or double-click empty parentheses, type a number or text, and save by clicking away.

## Files inspected

- Required agent index, current state, repository map and open questions; canvas design contract.
- `ExpressionCanvas.tsx`, `RuntimeTree.tsx`, `TreeScopeEditor.tsx`, canvas/runtime styles, `useStudio.ts`.
- Domain authoring, expression projection, runtime layout, canvas transaction and tree-operation code/tests.
- Python source AST schema and browser canvas/expression-tree harnesses and tests.

## Files changed

- `src/domain/inline-arguments.ts` and its tests: scalar discovery/display, conservative empty-call insertion and exact source edits; decimal-comma conversion and safe string quoting.
- `src/domain/authoring.ts`, `runtime-tree.ts`, `expression-tree.ts` and projection tests: typed literal values, inline call metadata, scalar child suppression and call width allowance.
- `src/domain/canvas.ts` and tests: revision-bound argument transactions without redundant grouping, preserving other pieces and comments.
- `src/components/InlineCallLabel.tsx`, `ExpressionCanvas.tsx`, `src/expression-canvas.css`: SVG argument controls, temporary textbox, blur/Enter/Escape behavior, no-op/history protection and visible-branch keyboard traversal. Native dialogs also keep the add-search shortcut from stealing focus.
- `tests/canvas.spec.ts`: three real-parser/engine browser flows and an orientation assertion using a real receiver instead of a scalar card. `tests/expression-tree.spec.ts`: Unicode search count adapted to the folded scalar.
- Agent current state, log, map, canvas contract and this handoff.

## Commands run

- Targeted `rg`, `sed`, `git diff`, Prettier and whitespace checks.
- `npx vitest run src/domain/inline-arguments.test.ts src/domain/expression-tree.test.ts src/domain/canvas.test.ts` — 43 pass.
- `npm run typecheck` and `npm run build` — pass; existing large-bundle advisory only.
- Focused `playwright test tests/canvas.spec.ts -g 'inline scalar'` — three pass with actual local parser/engine, no provider.
- `npx playwright test tests/canvas.spec.ts tests/ground-truth.spec.ts tests/expression-tree.spec.ts tests/next-passage.spec.ts tests/source-review.spec.ts` — 50/52 passed initially. The two older scalar-card expectations were updated and both passed a focused rerun; 52 distinct scenarios now pass.
- Final three inline browser cases rerun after the Enter focus fix — three pass, including immediate keyboard undo without refocusing first. Final build passes.
- Temporary visual probe captured normal/narrow resting and editing views at `/tmp/pydicate-inline-argument.png`, `/tmp/pydicate-inline-argument-editing.png`, `/tmp/pydicate-inline-argument-narrow.png` and `/tmp/pydicate-inline-argument-narrow-editing.png`.

## What worked

Numbers/strings are still present in the authoritative AST and participate in evaluation matching, but no longer create separate visible cards. Predicate and other expression inputs keep their source nodes and order. Keyword scalars remain separately editable. Unchanged literals, including numeric-looking strings, retain exact bytes/type. Comments, Unicode and signed/decimal values are covered. Inline edits are one source/forest undo operation; a no-op does not create a Studio history entry. Revision and passage changes discard stale input.

The resting label remains SVG text for export. Number input accepts signs and decimal point/comma; other input becomes quoted string data. Escape cancels, Enter or blur commits, and input keystrokes do not trigger canvas deletion or fullscreen exit. Keyboard completion retains canvas focus across reparse/remount so immediate undo works; blur preserves the destination control's focus.

## What failed

The restricted sandbox could not bind the local Vite listener (`EPERM`); scoped automatic approval permitted the browser tests. Two existing browser checks expected scalar child cards: orientation now measures a method's actual receiver, and Unicode search expects the folded graph count. Both reruns pass. Visual review caught Enter losing focus when the revision remounted its label; fallback focus to the surviving SVG fixed it, and a keyboard-only undo assertion now covers the case. No unresolved functional failure remains.

## Remaining questions

Boolean/None and composed expressions retain their existing graph representation; this request implements number/string input. Clearing an existing argument produces an empty string, while leaving a newly opened empty-call editor untouched preserves the original call. Very long displayed arguments are abbreviated, with their full source available in the operation tooltip and complete value in the editor. No native desktop smoke or historical corpus/reference mutation was run for this change.

## Suggested next prompt

Use the inline argument controls while building a passage and refine any remaining mouse/keyboard friction without changing the source AST or bypassing undo.
