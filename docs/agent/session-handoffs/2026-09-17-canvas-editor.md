# Canvas editing and localized grammar failures

## Goal

Make the source-faithful tree a usable mouse/keyboard editor: context menus, dragging and swapping, disconnect/remove/duplicate, persistent loose pieces, simple additions and connections, and compact details. Keep working intermediate forms visible when the main expression fails and prepare useful evidence for an agent editing the local grammar.

## Files inspected

Required agent index/current state/map/questions; source-operation tree, runtime layout, scope editor, operation terms and lexical picker; authoring hook, revision/history and draft persistence; Python source parser/interpreter/evaluation/source-preview/reference boundaries; provider context; Electron bridge/permissions; existing browser/native harnesses. Read-only engine and corpus inspection confirmed actual expressions and source/reference separation. Later engine changes outside this task were preserved.

## Files changed

- New `src/components/ExpressionCanvas.tsx`, `src/expression-canvas.css`, `src/domain/canvas.ts` and tests. Draft schema/model, Electron validation and canvas persistence tests.
- `RuntimeTree.tsx`, `expression-tree.ts`, `runtime-tree.ts`, `runtime-layout.test.ts`, `LexicalInput.tsx`: primary routing, holes and partial previews, geometry and popup keyboard integration.
- `App.tsx`, `useStudio.ts`, `GroundTruthPanel.tsx`: atomic canvas changes, same-source evaluation cache, partial result display and approval guards. `types.ts`/`authoring.ts`: explicit partial and failure contracts.
- `python/authoring_runtime.py`, `studio_authoring.py`, `authoring_service.py`, `rendered_structures.py`: local failures, reserved draft slots, publication/translation guards, detached search provenance; new partial-evaluation tests.
- `structure-drafts.ts` and tests: contextual loose pieces join the natural lookup index, including when the main expression is empty or unchanged.
- New `grammar-diagnostic.ts`/test, `GrammarDiagnosticDialog.tsx`/CSS: reproducible prompt and copy/export. Electron main/preload and bridge types add bounded write-only text copying through the existing sender-validated IPC boundary; browser permission policy remains unchanged.
- `provider-service.cjs` and focused mock tests: honest partial investigation context, complete-result requirement for translation.
- `tests/canvas-harness.*`, `tests/canvas.spec.ts`, `tests/authoring-sync.spec.ts`: actual primary canvas and revision/cache/history checks.
- [Canvas contract](../../design/canvas-editor.md), agent current state/map/questions/log and this handoff.

Existing dirty work was preserved. No project commit/push, provider generation, source/reference write or neighboring repository edit was made by this task.

## What worked

Context menus and connection circles support the same exact source transactions as drag/drop. Blank-space drags move whole subtrees, including hidden children when expanded later. Occupied unrelated targets swap; empty targets connect. Detach/remove leaves an explicit missing operand when required. Duplicate and detach retain independently editable loose expressions. Each structural transaction has one undo; autosave/restart preserves source, pieces and positions. Invalid main/orphan text remains repairable. Gestures and async evidence bind context and source rather than trusting a stale selection.

The new palette shares rendered-Tupi lookup. The detailed inspector starts collapsed; direct manipulation, keyboard traversal/shortcuts, search, wheel zoom, fullscreen and SVG remain available. Loose pieces evaluate asynchronously with two workers and context/source caching. Main evidence is reused for layout-only edits.

Canonical successful evaluation remains unchanged. Supported failures return independent successful stages plus direct error, dependency-blocked and empty-connection states. An isolated child can fail to render while still constructing an object that its parent realizes. Failure evidence includes dispatch, operand types, dependency IDs and bounded real engine stack frames. Main partial results cannot be translated or approved as reference; source previews reject unresolved draft slots.

The diagnostic dialog preserves exact source, context/revision, successful and failing steps and the selected local grammar path. It copies/exports a coding-agent prompt; it does not invoke a model or automatically edit grammar files. Native clipboard copying is verified and the previous clipboard was restored after the check.

## Commands run / verification

- `npm run build`, focused Prettier and `git diff --check`: pass. Existing Vite bundle-size advisory remains. Final production assets: `index-C0aLwqTF.js`, `index-Uin0BjOg.css`.
- `npx vitest run src/domain/canvas.test.ts src/domain/model.test.ts src/domain/grammar-diagnostic.test.ts src/domain/structure-drafts.test.ts src/domain/expression-tree.test.ts src/domain/runtime-tree.test.ts src/domain/runtime-layout.test.ts`: **64 pass**.
- `node --test electron/tests/canvas-validation.test.cjs electron/tests/draft-store.test.cjs`: **10 pass**, including actual atomic store restart and malformed-payload preservation.
- `node --test --test-name-pattern='Prompt identifies|Partial step evidence' electron/tests/providers.test.cjs`: **2 pass**, local mocks only.
- `npx playwright test tests/canvas.spec.ts tests/rendered-lookup.spec.ts tests/authoring-sync.spec.ts tests/ground-truth.spec.ts --output /tmp/pydicate-canvas-regressions`: **33 pass** in one run. One subsequent focused collapsed-subtree drag regression also passes: **34 distinct browser scenarios**, including **11 canvas scenarios**. Parsing/evaluation in the canvas harness uses real local Python; lookup transport is explicitly mocked there.
- Python partial/step/operation suites plus two existing interpretation/translation context checks: **26 pass**; rendered-structure suite: **11 pass**. This covers actual compound stages, all-82 independent final surface/annotation/structure parity, every explicit source step, insertion reproduction, missing slots and approval/translation boundaries.
- After detecting external engine edits, reran `PYDICATE_PROJECT_PARENT=/tmp/pydicate-canvas-fixture-TgOVfG python3 -B -m unittest python.tests.test_partial_evaluation python.tests.test_step_evaluation python.tests.test_operation_tree -v`: **24 pass** against a frozen copy, including all-82 parity against that engine's independent execution.
- `/tmp/pydicate-canvas-native.mjs`: actual production Electron, temporary user data. Duplicate/undo, detach with surviving branch results, reconnect, drag position, restart, method/engine failures, fullscreen diagnostic and actual clipboard equality pass. Final frozen-copy artifacts: **`/tmp/pydicate-canvas-native-hMQ6u3/`** (`report.json`, screenshots and `diagnostic.md`, visually inspected). Zero renderer errors; original source/lexicon/reference SHA-256 values unchanged. Earlier live-engine gestures/restart verification: `/tmp/pydicate-canvas-native-u1OYyg/`.
- Frozen fixture setup: `/tmp/pydicate-freeze-fixture.mjs` creates shared-object temporary Git clones and copies working source contents; no original repository is changed. Final native command: `CANVAS_PROJECT_PARENT=/tmp/pydicate-canvas-fixture-TgOVfG node /tmp/pydicate-canvas-native.mjs`.

No AI usage was consumed by these checks.

## What failed and was corrected

Review caught rejected repair of malformed main code, a render-frame stale fragment result on engine refresh, lost keyboard focus after context actions, fullscreen dialog placement, and hidden descendants not moving with a collapsed subtree. Each was corrected and checked. Inline errors now show their actual message rather than repeating the generic caption.

Native testing found that Electron's browser clipboard permission was correctly denied; an explicit bounded write-only bridge now handles the user's Copy action. The dialog also referenced nonexistent theme variables, making its background transparent; corrected to actual palette variables and visually checked.

One canvas browser run lost its shared Vite server; subsequent focused and aggregate runs passed. One native test incorrectly expected an engine frame for a nonexistent method; it now also uses `(îe * mombeu) + tym`, which supplies real frames.

A native rerun correctly hit `STALE_ENGINE` while `nhe-enga` files were being edited outside this task. The exact historical edit was not captured; current file changes and guard timing support that explanation. Preserved those edits and froze a copy for deterministic final checks. The copied engine changed Araújo81's final wording to `oemitymbûerypy pupé Tupã potame'enga no`; native comparison now derives its baseline from independent normal execution of the selected frozen engine, rather than assuming the earlier engine's wording. This is not historical/linguistic approval or a Studio morphology change.

## Remaining questions

Multi-selection/group transforms and portable shared forests are future work. Invalid Python syntax retains a raw repair card; it does not fabricate a partial AST. Helpers/aliases keep the existing explicit verified expansion workflow. Main stage results arrive in one evaluation response; loose pieces resolve independently. Existing contextual lookup still has a 1 MB RPC transport ceiling. The next useful validation is the user's actual next-line authoring, rather than more synthetic gestures.

## Suggested next prompt

Build the next passage using loose pieces, rendered-Tupi lookup and canvas connections. Identify the first confusing gesture or operation label, or any missing intermediate result; preserve exact source fidelity, local drafts and undo while improving that interaction.
