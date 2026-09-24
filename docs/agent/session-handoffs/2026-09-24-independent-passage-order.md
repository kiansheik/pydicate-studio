# Independent passage order and focused navigation

## Goal

Allow inserting missed passages, skipping unfinished work, and approving later
passages independently. Center saved PDF regions on opening/selection. Complete
a passage and immediately select the next visible list item.

## Files inspected

Required agent index/current-state/repo-map/open-questions; next-passage and PDF
designs; App/useStudio and navigation/draft/reference domains; PDF evidence UI
and desktop services; authoring service/runtime, source AST, adapter, regression,
reviewed-file transactions, learning/reference readers and targeted tests.
Read-only upstream corpus record/source APIs established the contiguous JSONL
constraint. Neighboring corpus and grammar files were not edited.

## Files changed

- `src/App.tsx`, `useStudio.ts`, `workbench.css`: insertion controls, saved skip,
  optional source-only review, pending anchor migration, completion navigation.
- `src/domain/{types,model,next-page,structure-drafts,ground-truth}.ts` and tests:
  stable insertion metadata, projected order, independent reference eligibility.
- `src/components/{PdfEvidence,SourcePane,GroundTruthPanel}.tsx`: region focus,
  insertion-aware evidence guides and removal of sequential approval warning.
- `electron/pending-context.cjs`, next/analysis/scratch/evidence services,
  validation and tests: consistent insertion context and predecessor evidence.
- `python/passage_insertion.py`, `passage_references.py`, authoring service/runtime,
  adapter, source AST helpers, publication regression and reviewed-file writer:
  identity-preserving insertion, sparse approval storage, verification and atomic
  new-file rollback. Learning library and eval-manifest builder include companions.
- Browser next-passage/ground-truth/PDF tests and Python passage-order/reference/
  pending-authoring/authoring tests cover affected contracts.
- Agent current state/log/repo map/open questions, contributor guide and workflow/
  PDF designs describe the new behavior and compatibility boundary.

## Commands run and results

- `python3 -B -m unittest python.tests.test_passage_order python.tests.test_pending_authoring python.tests.test_passage_references -v`: 20 passed.
- Targeted source approval/rollback/recovery authoring cases: five initially passed;
  exact-source-text case caught blank-line loss. Fixed byte preservation and reran
  it with passage-reference tests: all three passed.
- `node --test electron/tests/pending-context.test.cjs electron/tests/evidence.test.cjs`: 12 passed.
- `node --test electron/tests/analysis-service.test.cjs`: 26 passed with local socket permission; no provider calls.
- Scratch service tests passed in the initial combined Electron run.
- `npx vitest run src/domain/next-page.test.ts src/domain/ground-truth.test.ts src/domain/structure-drafts.test.ts src/domain/model.test.ts`: 37 passed.
- Playwright using `/private/tmp/pydicate-multipage.config.ts` (isolated port5184):
  full PDF/next suites 12 passed; subsequent next/ground-truth suites 20 passed;
  final focused insertion, completion, multipage and crop-centering checks 4 passed.
  These runs overlap and should not be summed as unique tests.
- `npm run typecheck` and `npx vite build`: passed. Vite reports its existing large
  chunk advisory. Avoided `npm run build`, which regenerates learning artifacts.
- Prettier on changed frontend files; `git diff --check`: passed.
- Inspected the completion test screenshot: navigation controls fit the desktop
  layout. Browser tests use fixtures; actual user-corpus workflow was not written.

## What worked

Later-first publication reanchors earlier drafts; duplicate source expressions
keep stable identities when inserting. Existing reviewed surfaces survive ordinal
relocation, and sparse verification catches mismatches after a gap. Wrapped list
items retain their source expressions and IDs. Scholarly locator inheritance is
checked against unchanged neighbors. Region clicks recenter even after scrolling;
completion advances and stays at the end. Local completion does not approve GT.

## Failures addressed / limits

Initial sandboxed analysis tests could not bind local Unix sockets; rerunning with
permission passed. An accidental broader test collection exposed a stale test
expecting pending lexical previews to be unsupported; existing HEAD supported
that path, so the test now asserts preview without writes. Append-only fixtures
also exposed unnecessary relocation during append; append no longer pins or
relocates unrelated existing rows. Blank reference-file lines are now preserved.

Legacy `<source>.jsonl` remains the contiguous approved prefix. Portable v1
`<source>.studio.json` carries approvals after the first gap with stable passage
IDs. Studio reads both; legacy standalone tools see only the prefix. Filling gaps
folds approvals back into JSONL without manufacturing unreviewed records. New-file
transaction rollback removes created files; explicit historical recovery may
leave an empty companion, which reads as no sparse approvals.

Source syntax cannot encode clearing an inherited section; preview rejects that
case rather than changing neighboring metadata. General queue reordering/deletion
and arbitrary-depth hierarchy are outside this change. No generated data, actual
corpus sources, provider requests, commits or pushes were made.

## Remaining questions

Should legacy standalone corpus tooling eventually read the sparse companion
natively? That requires a separate authorized neighboring-repository change.

## Suggested next prompt

Restart Studio and check insertion/skip/complete navigation and region focus on a
real working passage. If standalone corpus tooling needs sparse approval support,
extend its reader while preserving the no-placeholder reference contract.
