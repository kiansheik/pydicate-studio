# Predicate cards and source-operation connections

## Goal

Make Árvore faithful to the steps of Pydicate and capable of constructing previously unwritten compositions. The user clarified that lexical elements/predicates can be nodes and operations can be links. Preserve that visual distinction without losing grouping, occurrence identity or reversible source edits.

## Files inspected

Agent index/state/map/questions; `src/App.tsx`, `useStudio.ts`, `domain/authoring.ts`, runtime graph/layout and tests, `RuntimeTree.tsx`, `AuthoringEditor.tsx`, styles; Python parser/interpreter/lexicon inspection and existing runtime tests; Electron main-window permissions and installed API types. Read-only inspection of current Araújo81 source and lexical definitions established the compound's actual construction.

## Files changed

- `src/App.tsx`, `components/RuntimeTree.tsx`, `domain/authoring.ts`, `domain/runtime-tree.ts`, `runtime-tree.css`.
- New `components/TreeScopeEditor.tsx`, `tree-scope-editor.css`, `domain/expression-tree.ts`, `domain/tree-operations.ts`, and three corresponding projection/operation/layout domain test files.
- New `tests/expression-tree-harness.{html,tsx}`, `tests/expression-tree.spec.ts`, `python/tests/test_operation_tree.py`.
- `electron/main.cjs`, new `application-permissions.cjs` and its callback-policy tests.
- README, agent current-state, repo-map, open-questions, log and this handoff.

All preceding uncommitted milestone work remains. No neighboring-repository source or ground-truth records were edited during this task.

## Behavior and boundaries

`PydicateTree` uses the canonical parsed expression. Every explicit AST operation has its own compact branch junction and exact source scope; lexical references/literals are cards. Clicking a connection or its operation handle selects that scope. Child slots preserve operand ordering, receiver and named/positional arguments. `Classifier` and other evaluated information are evidence only, attached only if the entire evaluated source tree still matches the current expression. The old runtime viewer is retained separately for diagnostics/tests; it no longer defines the desktop's primary authoring tree.

The nine-step compound preserves all five lexical references and four operations. Compact junction geometry reduces its width from 1730 to 986 layout pixels. Search avoids inherited subtree/realization echoes. A syntax-valid expression remains editable when evaluation fails; while parsing, stale visual scopes are locked. Empty drafts can start from a lexical reference. No-op source remains exact, and changed operators preserve inter-operand comments/trivia with explicit grouping. Undo/redo uses the existing canonical draft history.

Reused composite variables remain references until the user accepts a shape-verified copied expansion; their shared definitions are not silently changed. Helper templates/parameters are inspectable through the existing Léxico workflow; automatic bound-helper expansion and drag rewiring are outside this update. This preserves declared source steps and does not claim that every hypothetical new composition is linguistically valid.

Fullscreen is restricted to the current trusted main window/frame in both production and development. External origins/subframes/other windows and other permissions remain denied. `disableHtmlFullscreenWindowResize` keeps the fullscreen tree inside the app window, avoiding the macOS native Space transition race. Escape explicitly exits the tree's fullscreen element in Electron.

## Commands run / what worked

- `npm run build`: passes; existing large-bundle advisory remains.
- `npm test -- src/domain/expression-tree.test.ts src/domain/tree-operations.test.ts src/domain/runtime-tree.test.ts src/domain/runtime-layout.test.ts`: 23 pass.
- `python3 -B -m unittest discover -s python/tests -p test_operation_tree.py -v`: 6 pass, including independent Python AST comparison for all 82 expressions/1,193 steps, actual compound realization and safe reused occurrence expansion.
- `node --test electron/tests/application-permissions.test.cjs`: 4 pass, invoking installed permission callbacks for allowed/rejected/teardown cases.
- `npx playwright test tests/expression-tree.spec.ts tests/runtime-tree.spec.ts`: 21 pass. Earlier same-turn `tests/authoring-sync.spec.ts`: 10 pass. Browser parsing uses the actual local Python parser and no providers.
- Native production probe `/tmp/pydicate-operation-native.mjs`: passes with a temporary application profile and actual Araújo81. Predicate/operation labels and exact search agree with source. Starting from `tym`, adding `emi`, `og`, `pûera` on the left and `/ ypy` on the right realizes `temityma`, `oemityma`, `oemitymbûera`, `oemitymbûerypy`; five undos restore the original full passage. Both immediate fullscreen entry/Escape exits pass; historical source SHA-256 is unchanged and no page errors occur. Screenshots/profile: `/tmp/pydicate-operation-native-5QXybk/`. Earlier pre-fullscreen-change run also verified the complete composition and undo workflow.
- Targeted Prettier and `git diff --check`: pass. Screenshots were inspected for actual predicate cards, operation connections and readable fullscreen layout.

## What failed

An early operator-change assertion expected comments to be dropped; implementation/tests now preserve them. A browser connection-click test exposed background pointer capture intercepting edge clicks; interactive links now skip pan capture, and mouse/keyboard activation passes. Native screenshots revealed that Electron's deny-all permission handler blocked fullscreen; the restricted permission policy fixes entry. Immediate native Escape then exposed a macOS transition race: the native window exited while DOM fullscreen remained set. Key events were confirmed to arrive; waiting for the native transition worked, and keeping HTML fullscreen within the app window eliminates the race without adding a delay. The original rapid entry/exit probe passes. These failures were local UI/tests, without any provider requests.

## Remaining questions

The actual historical PDF, portable packaging and the prior strict ground-truth metadata mismatch at Araújo74 remain unrelated existing boundaries. This update does not regenerate dependency baselines or ground truth.

## Suggested next prompt

Use the source-faithful tree on a real passage and identify the next editing gesture that feels awkward. Preserve lexical cards, operation connections, exact grouping and source identity when extending the interactions.
