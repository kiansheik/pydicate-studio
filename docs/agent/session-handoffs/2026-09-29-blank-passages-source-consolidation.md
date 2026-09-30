# Blank new passages and source-view consolidation

## Goal

Do not copy passage-specific content on Add passage; remove all fields after
Fonte's diplomatic transcription and its Save and analyze action; retain ordinary
autosave without automatic AI generation. Preserve the earlier uncommitted UX work.

## Files inspected

Required agent wiki; `src/domain/next-page.ts`, model/types, useStudio creation and
selection paths; App, SourcePane, AnalysisSupport, TranslationFields; next-passage,
analysis, translation and publication browser fixtures; next-hook harness; existing
next-passage design contract. No production or neighboring-repository changes.

## Files changed

- `src/domain/next-page.ts`: shared context now carries only source locators.
- `src/components/SourcePane.tsx`: remove extra fields and AI callback/button.
- `src/components/AnalysisSupport.tsx`: remove source submission wiring; direct
  accepted-translation instructions to the editor’s Tradução tab.
- `src/App.tsx`: stable accessible labels on the existing legacy translation inputs.
- `src/domain/next-page.test.ts`: blank content and preserved authored-target checks.
- Browser specs: next-passage, analysis-workspace, translations, translation-workflow,
  bulk-translation, ground-truth, proposal-publication, proposal-refresh, grammar-repair.
- New `tests/explicit-analysis.ts` and `tests/saved-reading-fixture.ts`: explicit IA
  request helper and durable legacy-metadata fixtures (no production test hooks).
- Next-passage design contract, agent current state/log/repo map and this handoff.

## Commands and results

- Targeted `rg`/file reads and `git diff --check`.
- `npm run typecheck`: passed.
- `npx vitest run src/domain/next-page.test.ts`: 8 passed.
- Playwright across the nine affected workflow specs: initially 48 passed / 9 failed.
  Failures were fixture assumptions: workspace App does not expose the separate
  hook harness's `__nextStudio`, an old normalized-field assertion remained after
  moving the undo check to transcription, and an implicit translation label changed
  with its textarea text. Use saved-envelope fixture/reopen for old metadata, real
  translation UI for concurrent edits, correct field assertion, explicit aria-label.
  Targeted rerun of all nine failures: 9 passed (21.4 seconds). All 57 affected
  cases have passed; no tests were removed or skipped. No live inference was used.
- `npm exec vite build`: production compilation; generated learning rebuild omitted
  to avoid rewriting checked-in generated corpus/documentation files.
- Targeted Prettier and diff checks completed before handoff.

## What worked

Add/insert and forward navigation leave passage-specific content blank while
continuing scholarly source location. Donor drafts remain intact. Repeated pending
passages, undo/redo, reopen, sparse publication and reference checks work. Fonte
shows just transcription after the source/PDF controls. Editing, autosave, reload
and insertion do not submit AI jobs even when the simulated provider is enabled.
Existing translations and AI hints survive; explicit IA workflows retain their
saved-revision and human-review protections. PT/EN and legacy translation editing
remain in the existing Tradução tab, with stable accessible names.

## What failed

The first browser run exposed fixture mistakes listed above; all affected cases
passed after correction. Source/AI changes did not require any backend, engine,
grammar or corpus mutation. Production build retains its existing large-chunk warning.

## Remaining questions

No retroactive clearing of existing drafts: copied versus intentionally authored
text cannot safely be distinguished. No deploy/commit/push or live user acceptance.
Earlier contributor-feedback work remains uncommitted alongside this change.

## Suggested next prompt

Review and deploy the combined contributor-UX and source-consolidation changes,
then verify adding passages and navigation on the contributors' actual screens.
