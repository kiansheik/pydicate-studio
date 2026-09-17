# Intermediate results and operation guidance

## Goal

Show what each Pydicate step evaluates to while building the tree, including the final root result. Preserve the predicate-card/operation-connection design. Follow the user's additional request for collapse/expand glyphs distinct from Pydicate `+`/`−`, and Portuguese linguistic names/explanations for authoring operations.

## Files inspected

Required agent index/state/map/questions; current AST interpreter and graph producer; source projection, tree geometry/component/editor, expression browser harness and existing source-operation regressions. Read-only inspection of the selected sibling Pydicate predicate and noun/verb/copula/number/postposition/deverbal/composition/adverb implementations established the terminology map. Memory's source-versus-rendered-output and grammatical-role guidance was verified against current source.

## Files changed

- `python/authoring_runtime.py`; new `python/tests/test_step_evaluation.py`.
- `src/domain/authoring.ts`, `expression-tree.ts`, `runtime-tree.ts`, `tree-operations.ts`; projection/layout tests; new `operation-terms.ts` and tests.
- `src/components/RuntimeTree.tsx`, `TreeScopeEditor.tsx`, `src/runtime-tree.css`, `tree-scope-editor.css`.
- `tests/expression-tree-harness.tsx`, `tests/expression-tree.spec.ts`.
- README, agent state/map/log, new `docs/design/operation-terms.md`, this handoff.

Previous dirty milestone files were preserved. No sibling engine/corpus edits, source/reference regeneration, commit or push.

## Implementation

Evaluated AST nodes now carry `evaluation` as successful surface, scalar value or unavailable message. The interpreter captures isolated snapshots before parent operations can consume/modify intermediate values. Engine `__deepcopy__` deliberately shares some mutable internal fields, so snapshotting copies stored mutable state independently, with cycles memoized and uncopyable state reported locally. Preview evaluation runs only after normal surface/annotations/structure/runtime graph capture; root reuses the canonical surface without another `eval()`.

Only a fully matching evaluated AST can supply result evidence to the source graph. Stale displayed structures lose their old results while parsing. The layout reserves space for short two-line inline results without replacing lexical/source identities; full forms stay in accessible SVG titles and the named inspector section. Empty strings display `∅ · forma vazia`, separately from unavailable stages. The original exact string remains in the model. Root is labeled Resultado final; lexical references also show their own realization.

Operation pills remain compact on connecting lines, with the result below. Chevrons replace branch expansion/collapse signs. Portuguese terms and explanations use stable authoring keys and a central map, with narrower overload labels enabled only by confirmed implementation/type evidence. `/` composition is distinguished from `@` copular predication; generic `*` does not invent subject/object roles. Full terminology boundaries are documented in the design note.

## Commands run / what worked

- `npm run build`: passes; pre-existing large-bundle advisory remains.
- `npm test -- src/domain/expression-tree.test.ts src/domain/runtime-layout.test.ts src/domain/runtime-tree.test.ts src/domain/tree-operations.test.ts src/domain/operation-terms.test.ts`: 35 pass.
- `python3 -B -m unittest discover -s python/tests -p test_step_evaluation.py -v`: 6 pass. Existing runtime/approval and operation-tree suites: 10 + 6 pass. Independent normal realization comparisons cover all 82 Araújo roots, annotations and structures. Across 1,193 steps, 1,179 forms and 12 scalar values succeed; two intermediate stages legitimately fail alone while their complete parent/root succeeds.
- `npx playwright test tests/expression-tree.spec.ts tests/runtime-tree.spec.ts tests/authoring-sync.spec.ts`: 36 pass (13 + 13 + 10). Includes actual per-stage forms, incremental composition, undo/redo, long/empty/unavailable forms, stale evidence rejection, Portuguese descriptions and chevron states.
- `/tmp/pydicate-step-results-native.mjs`: production Electron with temporary profile, actual Araújo81 and local engine. Confirms `temityma → oemityma → oemitymbûera → oemitymbûerypy`, visible final root, Portuguese heading, no branch sign glyphs, incremental composition and five undos restoring the original full passage. Fullscreen entry/exit works, no page errors, historical source SHA-256 unchanged. Screenshots/profile: `/tmp/pydicate-operation-native-MM5E11/`; screenshot inspected for readable result placement.
- Targeted Prettier, TypeScript and `git diff --check`: pass. No live AI generation calls.

## What failed

The initial browser run exposed the queued empty-inspector display gap: the graph showed an empty-form marker but the inspector still showed a blank string. Both views now distinguish it explicitly; final browser suite passes. Expected local-port sandbox denial was handled through scoped approved localhost/browser execution. Neither was a corpus or provider error.

## Remaining questions

Some intermediate values require their parent context (`îe * mombeu` and its variant in the current corpus); their isolated evaluation is explicitly unavailable rather than guessed. Inline long forms are abbreviated, with complete values available on selection. The selected engine does not implement every adapter-listed method, notably `.ord()`; terminology documents availability rather than promising new engine behavior. New helper semantics or changed engine overloads require updating the central map. User's next actual line-authoring feedback will guide further interaction changes.

## Suggested next prompt

Build the next real line with the tree and report the first confusing or excessive interaction. Keep intermediate results, Portuguese guidance, exact source grouping and undo fidelity while refining it.
