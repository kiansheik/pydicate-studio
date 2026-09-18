# Single-noun publication and editable translations

## Goal
Resolve the saved mendara single-noun publication failure and register tentative translations with successful AI proposals while allowing human translations from the start.

## Files inspected
Required agent docs; App/useStudio, CandidateProjection/AnalysisSupport, SourcePane/GroundTruthPanel, source_new_preview and lexical publication, scratch/analysis service and provider strategy, existing regression/browser fixtures. Read the actual saved pending mendara draft and candidate without modifying the profile. The draft raw was empty; the displayed candidate contained a valid standalone Noun.

## Files changed
- `src/App.tsx`, `src/useStudio.ts`, `src/components/GroundTruthPanel.tsx`: explicit displayed-proposal acceptance then latest-revision source review, including the Ground Truth entry point; discard delayed results after navigation or edits.
- `python/authoring_service.py`: distinguish an empty draft from invalid syntax.
- `src/components/SourcePane.tsx`, `AnalysisSupport.tsx`, `src/domain/analysis.ts`: always editable human translation, tentative proposal display, revision-bound explicit copy/replace and combined proposal acceptance; candidate review action.
- `electron/scratch-service.cjs`, `agent-runner.cjs`, `analysis-service.cjs`: same-run required tentative translation for complete new proposals, revision binding/invalidation, retrieval and compact listing.
- New `python/tests/test_noun_publication.py`, `tests/proposal-publication.spec.ts`, `tests/translation-workflow.spec.ts`; focused domain/service tests and deterministic proposal fixtures in existing tests/smoke/Codex transport scripts.
- Existing next-passage/browser stale-review tests updated to current source-field labels, read-only status behavior and earlier obsolete-preview rejection. Agent docs, contributor guide and MCP/authoring contracts updated.

## Commands run
- Targeted rg/sed and read-only profile JSON inspection; scoped Prettier; `npm run build`; `git diff --check`.
- `python3 -B -m unittest discover -s python/tests -p test_noun_publication.py -v`: 1 passed.
- `node /tmp/studio-mendara-preview-proof.cjs`: actual preserved candidate through PythonWorker open_project/source_new_preview in temporary state. Evidence `/tmp/studio-mendara-preview-proof.json`.
- Scratch service tests: 9 passed; analysis-service/agent-runner/studio-mcp tests: 34 passed; domain analysis tests: 5 passed. Translation logs under `/tmp/studio-translation-{scratch,service,browser,acceptance}.log`.
- Playwright isolated port5197: 4 proposal-publication, 5 next-passage, 2 ground-truth, 1 authoring-sync stale-review and 1 existing analysis-workspace acceptance scenario passed across focused runs. Final root run: 7/7.
- Translation Playwright isolated port5198: 2/2 passed after final revision guard. Suggestion screenshot inspected under `/tmp/studio-translation-results/`.

## What worked
The real saved noun previews as `l += mendara` with one new named shared lexicon declaration. Full staged regression: 128 checked expressions, 127 saved references, zero failures, zero baseline issues/pending references. All 12 protected real source/lexicon/reference/draft/analysis files hash-identical. UI tests prove that an empty pending draft accepts the displayed noun before review from header, tree and Ground Truth dialog; cancelling never applies or approves, and acceptance remains undoable.

Human translation can be written before generation, survives expression acceptance, can explicitly receive the AI suggestion, remains editable and persists across reload. Combined proposal/translation acceptance avoids making the proposal stale by copying its translation prematurely. Complete new proposals require a tentative translation in the same provider run; no extra provider request is scheduled. Existing proposals remain readable.

## What failed
Initial browser runs exposed outdated test selectors for the renamed/collapsed reviewed-reading field, a new-passage dialog title, and an assertion incorrectly treating read-only ai_status as generation. Corrected those fixture assertions. The previous stale-preview regression expected rejection only at apply; it now verifies rejection when preparation finishes. All affected checks subsequently passed. Production build retains the existing large-chunk advisory.

## Remaining questions
Restart the desktop process to load changed main-process services, close any old prepared review and reopen the saved proposal. Real linguistic translation quality has not been tested with paid generation; routine tests use deterministic provider boundaries. Existing saved proposals without a translation are not automatically rerun. Manual translation is immediately available. Source publication and ground truth remain explicit human decisions.

## Suggested next prompt
Restart Studio, inspect the saved mendara proposal and use Usar e revisar proposta. Check its named lexicon entry, enter a Portuguese translation in Fonte, then try the next user-initiated analysis and review its stored translation suggestion.
