# Composite lexicon publication and automatic regression

## Goal
Attach nhemoabaré's meaning to its complete composition, preserve abaré's individual meaning, and run corpus regression before each source/lexicon publication.

## Files inspected
Required agent docs; lexical_publication, authoring_service/runtime, reviewed_files, studio_authoring; selected local lexicon and Navarro descriptors; upstream authoring verification contract; ExpressionCanvas, AnalysisSupport, SourceReviewContent, operation terms, App; PythonWorker/next-service, provider strategy/scratch guide; lexical publication and canvas tests.

## Files changed
- `python/lexical_publication.py`: explicit composition definition, optional exact grammar checked base restoration/reuse, nested composite promotion, evaluated-surface names/collision handling.
- `python/authoring_runtime.py`, `authoring_service.py`: read-only composition RPC, regression snapshot dispatch, checked preview and fingerprint-bound application; replace existing shared definition override correctly.
- New `python/publication_regression.py`: before/after engine snapshots and staged-copy corpus/reference regression with explicit recovery handling.
- `electron/next-service.cjs`, `python-worker.cjs`: allow the composition RPC; agent-runner and scratch guide: whole-composition semantics guidance.
- `src/components/ExpressionCanvas.tsx`: node context action/dialog, restored base meanings, cancellable/revision-bound draft changes and undo.
- `src/components/AnalysisSupport.tsx`: use actual passage identity for candidate preview research RPCs.
- `src/components/SourceReviewContent.tsx`, `src/domain/authoring.ts`, `src/App.tsx`: visible regression results and preparing status.
- `src/domain/operation-terms.ts`: Portuguese meaning for the definition wrapper.
- `python/tests/test_lexical_publication.py`, `tests/canvas.spec.ts`: actual composition definition/publication/edit/reuse, failure blocking, context menu and undo.
- Agent current-state/log/repo-map, lexical publication contract and contributor guide.

## Commands run
- Targeted searches/reads, Prettier, `git diff --check`.
- `npm run build`: passed; existing large bundle warning.
- `node --test electron/tests/agent-runner.test.cjs electron/tests/scratch-service.test.cjs`: 24 passed.
- `node --test electron/tests/python-worker.test.cjs electron/tests/next-service.test.cjs`: 5 passed.
- `python3 -B -m unittest python.tests.test_lexical_publication -v`: 13/14 initially; the running process had the old strict removal check cached. Explicit recovery exception added; focused recovery rerun passed. Fourteen scenarios covered across these runs.
- Focused new composite/publication and regression-blocking tests also passed independently.
- Isolated Playwright canvas whole-composition test: passed after correcting the undo locator to its real accessible name.
- Focused proposal inspection/context-menu browser checks: 2 passed after using the actual passage identity.
- Actual PythonWorker open-project/composition-define/source-new-preview in a temporary profile: result nhemoabare, base and compound declarations separated, 127 evaluated rows, 126 matching saved references, zero baseline issues. SHA-256 of original lexicon/source/reference files unchanged.

## What worked
Restoring the corrupted abaré leaf from its exact dictionary entry gives its full padre definition; compound declaration receives the sacrament definition. When the base already exists, the second composition reuses its variable. Editing the shared compound meaning updates one effective assignment and leaves base meaning intact. Invalid new lines and shared surface changes fail before any original-file write. Existing lexical identity, collision, multi-file rollback and recovery scenarios remain covered. UI definition and undo work with the real engine.

## What failed
First browser test used an incorrect undo button name; implementation had completed successfully. Initial regression rejected explicit recovery removing a newly published trailing row; added a recovery-only allowance and verified it in a fresh process. Inspection caught the PythonWorker allowlist and fake candidate passage identity gaps; native bridge verified the new method after fixing both paths.

## Remaining questions
Existing malformed drafts are preserved until the contributor selects the whole-node definition action and reviews the corrected publication. No paid request, original source write or real profile mutation occurred. Prompt guidance cannot guarantee future model linguistic decisions. Baseline failures remain visible without blocking unrelated repairs; changed-row reference approval stays explicit. Regression compares concrete engine output/annotations and saved references, not semantic correctness of every gloss. Full corpus regression runs at publication review, not every keystroke; draft evaluation remains live. Selected collection extraction currently supports the historic .tu.py sources recognized by the adapter.

## Suggested next prompt
Restart Studio; on the complete nhemoabaré root choose Definir significado do conjunto, enter its meaning with base restoration enabled, then review again. Confirm the separate base/compound entries and regression result before publication.
