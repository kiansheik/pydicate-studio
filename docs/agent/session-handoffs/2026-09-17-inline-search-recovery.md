# Inline canvas search and automatic freshness recovery — 2026-09-17

## Goal

Make piece insertion available directly in the tree, dismiss floating editors on outside clicks, and recover stale corpus/grammar lookup errors automatically without losing contributor work or replaying stale edits.

## Files inspected

- Required `docs/agent/{index,current-state,repo-map,open-questions}.md`; dictionary, canvas and rendered-reuse contracts.
- `ExpressionCanvas`, `PredicatePalette`, `LexicalInput`, `DictionaryEntryCreation`, `useStudio`, draft/model/context helpers and styles.
- Electron main/preload/worker/service/watch paths and Python freshness/index/conversion handlers.
- Canvas, lookup and authoring hook fixtures; previous disposable native-test harnesses.

## Files changed

- `src/components/PieceSearch.tsx`: shared verified search/insertion, synchronous dismissal, context-bound choices.
- `src/components/{ExpressionCanvas,PredicatePalette,LexicalInput}.tsx`, `src/{expression-canvas,lexical-input}.css`: native inline textbox, compact overlay, immediate main/loose insertion, retained query, stale-index research, click-away without swallowing canvas gestures.
- `src/domain/{authoring,project-recovery}.ts`, `src/useStudio.ts`: service-code normalization, one browse retry, coalesced refresh, live draft/history preservation, source-change recovery, no stale insertion/write replay, explicit busy source-application rejection.
- `electron/{main,preload,service-errors}.cjs`: bounded coded-error transport, unchanged successful values.
- `src/domain/project-recovery.test.ts`, `electron/tests/service-errors.test.cjs`, `python/tests/test_lookup_refresh.py`, `tests/{canvas,rendered-lookup,authoring-sync}.spec.ts`, `tests/next-hook-harness.tsx`.
- Current state, log, repo map, dictionary contract, this handoff and the [backend subtask handoff](2026-09-17-lookup-refresh-backend.md).

## Commands run

- `npm run build`, `npm run typecheck`; targeted `npx prettier --write/--check`; `git diff --check`.
- `npx vitest run src/domain/project-recovery.test.ts` — 11 passed.
- `node --test electron/tests/service-errors.test.cjs electron/tests/python-worker-authoring.test.cjs` — 5 passed.
- `python3 -B -m unittest python.tests.test_lookup_refresh -v` — 3 passed.
- Focused `tests/canvas.spec.ts` cases — 9 passed; later compact-popover/direct-insertion cases — 3 passed; query retention through revision refresh with storage removed — 1 passed.
- `tests/rendered-lookup.spec.ts` — 11 passed, including stale-index research without insertion replay.
- `tests/authoring-sync.spec.ts` — 16 passed, including 4 new recovery cases; held-refresh source-application assertion also passed in a focused rerun.
- `node /tmp/pydicate-inline-recovery-native.mjs` — production Electron with temporary profile/disposable corpus and a restored temporary engine edit.

## What worked

Native production verification inserted `(pûera * (og * (emi * tym))) / ypy` from spaced Tupi directly into an empty shell. A disposable engine edit produced the real coded stale error across IPC/contextBridge; typing in the ordinary search then refreshed/retried automatically. The query, draft raw, canvas and revision remained exact. Navarro's selected `pysyrõ` sense (`vid=9337`) became an independently evaluated loose piece, and undo removed it while preserving the main tree. Original source/lexicon/reference/engine hashes were unchanged; no page errors or provider calls. Native report/screenshots: `/tmp/pydicate-inline-recovery-CHhJS0/`.

Browser contracts cover late resolution after click-away, ordinary pan/node gestures, add/operation/combine dismissal, concurrent stale reads sharing one refresh, edits during held refresh, pending/archived draft retention, selection and undo/redo, and true source conflicts remaining explicit. Backend tests retain freshness, source patch and candidate-index guards.

## What failed

The first native harness invocation used the wrong temporary engine path (`pydicate/__init__.py` instead of `pydicate/pydicate/__init__.py`) and stopped before launch; corrected invocation passed. Review caught a previously silent `applySource` return during background refresh that could close the review without applying; it now rejects and has a regression assertion. Production build retains the existing large-bundle advisory.

## Remaining questions

No implementation blocker. Real source conflicts still require comparison/reconciliation, and selected entries that changed require a fresh choice. Repeated changes during the single retry or unreadable files can still fail visibly. Restart the desktop process once to load the new main/preload transport; renderer HMR alone cannot load it. Manual dictionary iframe refresh remains separate from piece-search recovery. No installer, provider generation, corpus publication, commit or push was part of this change.

## Suggested next prompt

Use the inline tree search on a real new passage and report any remaining friction in adding, connecting or changing pieces. Preserve current source/reconciliation safeguards and avoid live AI usage in routine checks.
