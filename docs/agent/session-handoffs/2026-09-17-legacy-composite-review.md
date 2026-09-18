# Ordinary review of a retained malformed compound

## Goal
The same abare-only diff persisted because the previous feature required manual tree definition. Make ordinary review of the actual saved malformed draft prepare the correct named composite directly.

## Files inspected
Required agent docs; lexical_publication and authoring_service; SourceReviewContent/types; sourcePreview/applySource in useStudio; dev launcher; actual retained pending dbb1dab7 draft read-only; existing/new lexical tests and browser harness.

## Files changed
- `python/lexical_publication.py`: conservative exact dictionary/surface detection, repair only the affected literal, preserve full compound meaning, and separate grammar vs explicit-copy realization checks.
- `python/adapter.py`: include the regression implementation in project fingerprints so changed review policy invalidates old checks.
- `python/authoring_service.py`: propagate definitionRepairs in ordinary source and new-line previews.
- `src/domain/authoring.ts`, `src/components/SourceReviewContent.tsx`: typed, visible semantic repair explanation before technical details.
- `python/tests/test_legacy_composite_review.py`: reported legacy draft, repeatability, exact sense, custom/nonmatching/explicit-scope controls.
- `tests/source-definition-repair.spec.ts`: ordinary review UI notice and no draft/application side effects.
- Agent current-state/log, lexical publication contract and contributor guide.

## Commands run
- Targeted reads/searches and Prettier; `npm run build`; `git diff --check`.
- Five legacy composite Python integration checks passed (four together plus explicit-scope control), plus three existing literal publication/collision/manual-composite checks across the focused run and collision rerun.
- Isolated Playwright source-definition-repair browser scenario: 1 passed; screenshot `/tmp/studio-source-definition-repair.png` inspected.
- Actual PythonWorker open_project + source_new_preview using the saved pending draft's exact raw text and locators, with temporary state. Saved review artifact: `/tmp/studio-legacy-composite-review.json`.

## What worked
Ordinary review now proposes abare with the full padre dictionary definition, nhemoabare as the complete .var(1).base_nominal() composition with its own definition, and l += nhemoabare. Native check evaluated 127 rows with all 126 existing references matching and no baseline issues. Hashes of the actual draft files, source, lexicon and reference records remained unchanged. No composition_define action or paid AI request was needed.

## What failed
The initial restoration guard compared runtime internal shape after studio_define's copy. The engine deep copy changes nominal noun self-links, so the guard falsely rejected the repair. Exact grammar comparison now happens after base restoration before copying; copied surface/annotations must still match, and ordinary lexical promotion retains its full corrected-state proof.

One existing collision test correctly rejected a review as STALE_ENGINE because the implementation was edited while its regression ran. It passed when rerun against the settled implementation.

## Remaining questions
An already prepared dialog retains its exact old patch. Generate a new review; restart Studio to load all UI/service changes. The automatic correction is intentionally limited to exact evidence of this legacy mistake. General linguistic intent cannot be inferred from arbitrary custom glosses. Original drafts and sources are preserved until explicit publication. Corpus regression validates output and saved references, not every semantic judgment.

## Suggested next prompt
Restart Studio and reopen Revisar nova passagem on the existing draft. Confirm the named compound and separated meanings in the corrected diff without any tree action.
