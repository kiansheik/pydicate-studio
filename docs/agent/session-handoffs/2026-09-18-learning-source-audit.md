# Tutorial guidance and source documentation audit

## Goal

Finish the Brazilian Portuguese five-lesson learning experience against actual approved `.tu.py` examples, make beginner tree gestures understandable, and ensure future engine/corpus comments feed the searchable in-app reference during builds. The existing learning implementation was already present at turn start; this work audited and improved it without replacing other uncommitted work.

## Files inspected

- `docs/agent/{index,current-state,repo-map,open-questions}.md`, initial learning handoff, README, learning design.
- `python/learning_library.py`, build script, authoring runtime/service, actual historical sources and lexicon, engine implementations, source/record pairing.
- App, LearningWorkspace/LessonQuestion, ExpressionCanvas/RuntimeTree, learning domain, operation terms, project recovery, learning fixtures/config/tests.
- Local authoring MCP via JSON-RPC (`python3 -B -m authoring.mcp_server`): tool discovery, source inventory/status, source context and annotated candidate rendering.
- Memory registry source/ordinal pairing guidance; facts rechecked against current code and MCP.

## Files changed

- `python/learning_library.py`: standalone Python comment and true module/class/function docstring extraction across grammar and historic sources, source-line diagnostics, strict guide/link validation; corrected stage instructions and isolated-output hints.
- `python/tests/test_learning_library.py`: six hermetic source-comment/docstring validation cases, alongside existing actual-corpus tests.
- `src/components/LearningWorkspace.tsx`: beginner roadmap, direct-reference initial view, visible next-stage navigation, per-stage/completed feedback, fuller implementation search and documentation maintenance guide.
- `src/App.tsx`: separate Aprender and Referência entry points.
- `src/domain/learning.ts` and tests: stage structure/surface/annotation/evaluation comparisons; only explicit partial stages accepted; final completion requires complete evaluation.
- `src/domain/project-recovery.ts` and tests: one refresh/retry for read-only learning library requests.
- `src/learning.css`: wrapping labeled stage navigation and stage feedback style.
- `tests/learning.spec.ts`: actual mouse/search assembly and completed-stage feedback; reference selector scoped to its list.
- `src/generated/learning.json`: regenerated through build only.
- README, `docs/design/learning.md`, current state, log, this handoff.

## Commands run

- Read-only MCP audit against both historic sources; compact evidence at `/tmp/studio-learning-curriculum-mcp-audit.json`.
- `npm run build` (documentation generation, TypeScript, Vite).
- `npm run docs:check`.
- `npx vitest run src/domain/learning.test.ts src/domain/project-recovery.test.ts`: 15 pass.
- `python3 -B -m unittest discover -s python/tests -p test_learning_library.py -v`: 11 pass, including actual local sources.
- `STUDIO_TEST_PORT=5198 npm run test:learning`: five scenarios pass across initial suite and focused reference/mouse reruns. Last mouse rerun includes the completed-stage message.
- Focused Prettier write/check on changed TS/TSX/CSS/test files; `git diff --check` and staged diff whitespace check.
- Inspected desktop and 390px browser screenshots; final mouse evidence at ignored `test-results/learning-mouse-completion.png`.

## What worked

- MCP confirms 89 Araújo and 40 Bettendorff approved references, all matching. Five final lesson expressions match their approved source ASTs and annotated forms: Araújo 38, 5, 69, 85, 86.
- Five lessons total an estimated ten minutes. First lesson is completed through rendered-form search, inserting the named predicate, selecting connector points, choosing `*`, and answering the question, without code entry/model replacement.
- Each stage now describes its own intended tree, advances guidance without discarding work, and reports actual matching state. Hints explain isolated arobiar changing realization when completed, and omission becoming visible in the verbal context.
- Reference contains 25 Portuguese guides, 235 implementation/helper entries and 129 source examples. Source comments retain portable file/line locations and support corpus/lexicon metadata without manual duplication.
- No paid inference, real profile writes, source publication or ground-truth approval. Protected-file hashes unchanged across browser/Python tests. Existing source definitions were not rewritten.

## What failed

- One reference browser selector became ambiguous when the beginner guide added a related `.var()` link. Scoping to the results list fixed it.
- One focused browser attempt correctly rejected a fingerprint while source files were being formatted/generated concurrently. Repeating after files settled passed; this was a test scheduling issue.
- A final docs check detected changed source-line locations in the external grammar after generation (24 API entries in noun.py). Comparing generated data showed only implementation `id`/`source` locations changed, not lesson/reference content. Regenerated from the current files; did not restore or edit the external source.
- Vite retains the existing main-bundle size warning.

## Remaining questions

- Ten minutes is a content budget, not measured beginner usability. Live AI answer quality remains untested; simulated-provider questions verify isolation and presentation only.
- Two lesson-4 stages intentionally cannot fully realize before nominalization. They remain explicit partial stages; no automatic variant/grammar substitution.
- Tutorial piece search shares the ordinary editor's remembered search query for that source. Actual practice trees, drafts and completion state are separate.
- Reproducible generation needs matching local `oldtupicorpus` and `nhe-enga` clones. The existing standalone CI checkout does not provision these dependencies; do not claim a fresh Studio-only checkout can run the strict build.
- Shared approved references power lessons, rather than one person's private Concluídas status.

## Suggested next prompt

"Observe uma pessoa falante de tupi completando as cinco lições pelo mouse, registre onde precisou de ajuda e ajuste as orientações e os gestos para caberem em dez minutos. Preserve a análise e a referência de cada exemplo."
