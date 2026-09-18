# Immediate proposal editing and local revalidation

## Goal
Make inspecting a proposal immediately load the working tree, and fix the actual stale-engine acceptance error without paid regeneration.

## Files inspected
Required agent docs; analysis acceptance/service/store/validation; App/useStudio and AnalysisSupport/domain contracts; project refresh/recovery/main-process lifecycle; real saved mendara profile and prior Python-only proof; existing browser/service tests and contributor contracts.

## Files changed
- `src/components/AnalysisSupport.tsx`: immediate inspection adoption, preserve metadata/layout, fetch-time race protection, actual working canvas; fix legacy preview restoration completing before candidate hydration.
- `src/App.tsx`: candidate evidence focus uses the working editor too.
- `src/useStudio.ts`: one local refresh and same-command acceptance retry for stale engine/source snapshots; display changed/failed local-result notice.
- `src/domain/analysis.ts`, its test and `types.ts`: historical engine/input may differ for deliberate current-CAS adoption; type durable revalidation receipts.
- `electron/analysis-service.cjs`, `draft-store.cjs`, `validation.cjs`: local evaluation plus immutable original evidence, current draft/source/engine guards, distinct revalidation receipt, editable partial/failed results, idempotent replay and published-passage aliases.
- `electron/tests/analysis-service.test.cjs`, `tests/analysis-workspace.spec.ts`, `tests/proposal-publication.spec.ts`, new `tests/proposal-refresh.spec.ts`: current adoption/recovery/races/undo, retained translations and legacy preview behavior.
- Agent current-state/log/map, contributor guide and authoring contract.

## Commands run
- Targeted rg/sed and read-only profile inspection; scoped Prettier; `npm run typecheck`; `npm run build`; `git diff --check`.
- `node --test electron/tests/analysis-service.test.cjs electron/tests/draft-store.test.cjs`:27 passed.
- `npx vitest run src/domain/analysis.test.ts`:5 passed.
- Playwright analysis-workspace and proposal-publication on isolated5198:18/18 passed after final fix; configuration `/tmp/studio-inspect-playwright.config.ts`.
- Playwright proposal-refresh plus translation-workflow on isolated5197:4 unique scenarios passed across initial run and one failed-selector rerun; configuration `/tmp/studio-chat-playwright.config.ts`.
- `node /tmp/studio-mendara-acceptance-proof.cjs`: real AnalysisService+DraftStore+PythonWorker with original saved candidate/draft copied into disposable state, followed by actual source_new_preview; no source_apply. JSON evidence `/tmp/studio-mendara-acceptance-proof.json`, diff `/tmp/studio-mendara-acceptance-preview.diff`.

## What worked
The exact candidate with old fingerprint53626c... adopts under current local e5adcd... and renders mendara completely with unchanged annotated output. Repeat command returns the same receipt/revision without another local evaluation. Original job input/candidate/revisions remain unchanged; six jobs before/after; zero provider calls. Full staged publication names `mendara = Noun(...)` and `l += mendara`, checks128 expressions/127references, zero failures.13 real source/reference/profile/evidence files hash-identical.

UI inspection enters the ordinary bottom-up editor immediately. Context menus, orientation, undo, review and Ground Truth entry point use the current tree. Repeated same-tree inspection preserves layout and avoids duplicate acceptance. Changed human input can deliberately reuse a proposal while retaining translation/reading fields; edits during fetch/evaluation still fail CAS. A stale worker snapshot refreshes once and reuses the same command ID, with no model resubmission. Changed/partial/failed local output remains editable and cannot substitute old model output for current publication evidence.

## What failed
The previous mendara proof reached Python publication but skipped acceptance, so it missed `assertFresh(job)` rejecting original AI engine fingerprints after program/corpus changes. The new proof covers this exact boundary. Browser tests also exposed legacy preview restoration marking its project/passage key before candidate data arrived; fixed dependencies and mark success only after fetch. Two initial assertions needed updated error-container/debounced-evaluation selectors. All22 relevant browser scenarios subsequently pass. Build retains the existing large-chunk advisory.

## Remaining questions
Desktop main-process changes require a full Studio restart; renderer reload alone cannot load them. Existing proposals do not need a new AI run. Current source/publication/reference checks remain explicit. Real paid model quality was not retested. The native proof uses disposable state rather than mutating the contributor's live session.

## Suggested next prompt
Fully restart Studio, inspect the existing mendara proposal and edit/review the working tree directly. Confirm that the old grammar message no longer demands regeneration and proceed with the next passage.
