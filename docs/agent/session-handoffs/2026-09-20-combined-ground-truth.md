# One source and ground-truth confirmation

## Goal

Open the passage/added-lexicon diff directly from **Commit to Ground Truth** and
make accepting that review save both source and ground truth. Remove the second
confirmation, including for new passages and already-published source.

## Files inspected

Required agent docs, prior source/publication handoffs, `App.tsx`,
`GroundTruthPanel.tsx`, `SourceReviewContent.tsx`, `useStudio.ts`, ground-truth
domain guards, desktop source/reference routing, Python source application and
authoritative approval, and publication/browser harnesses.

## Files changed

- `src/App.tsx`: direct review entry, one explicit save action, Escape/cancel,
  current-result guard and distinct source/reference/local-draft failure notices.
- `src/components/SourceReviewContent.tsx`: reference intent/current reference in
  the existing diff/lexicon review; shared revision-bound result selection.
- `src/useStudio.ts`: one operation lock across source application and reference
  approval, stable pending-ID migration, unchanged-source path, structured partial
  outcomes and caller engine fingerprint.
- `python/authoring_service.py` and `python/tests/test_authoring.py`: enforce the
  caller's reviewed engine fingerprint during reference approval, including after
  another operation refreshes the backend project.
- `tests/{ground-truth,proposal-publication,source-review}.spec.ts` and
  `tests/next-hook-harness.tsx`: combined review, no-diff retry, pending identity,
  failure/concurrency/stale state and an opt-in in-memory publication fixture.
- Agent current state, log, repository map, contributor guide, next-passage
  contract and this handoff.

## Commands run and results

- `npm run typecheck && npx vite build`: passed on the final product code;
  existing large-chunk advisory remains. Avoided generated learning rebuild.
- `npx vitest run src/domain/ground-truth.test.ts`: **11 passed**.
- `npx playwright test --config /private/tmp/pydicate-parser-lab-ui.config.ts
  tests/ground-truth.spec.ts tests/proposal-publication.spec.ts
  tests/source-review.spec.ts`: **21 passed** on fresh Vite5179, simulated
  transport only. The publication fixture checks the post-save engine fingerprint.
- Adjacent browser command with the same config and
  `tests/authoring-sync.spec.ts tests/next-passage.spec.ts --grep 'source previews
  are discarded|applying a lexical definition|simulated pending source preview'`:
  **3 passed**; the grep is one continuous argument. Total browser evidence is
  **24 passing cases**. The owned Vite5179 server was stopped.
- `python3 -B -m unittest
  python.tests.test_authoring.CorpusCopyTests.test_reference_approval_rejects_stale_engine_after_backend_refresh_with_same_surface
  python.tests.test_authoring.CorpusCopyTests.test_explicit_authoritative_approval_writes_only_next_reference
  python.tests.test_authoring.CorpusCopyTests.test_reference_approval_requires_explicit_surface_and_sequential_authority -v`:
  **3 passed** using disposable corpus copies.
- Scoped Prettier and `git diff --check`: passed.
- Inspected `/private/tmp/pydicate-ground-truth-review.png`: added lexical entry,
  hypothesis status, current form and both technical file diffs render correctly;
  expanded review content scrolls inside the overlay.

## What worked

Both existing ground-truth buttons open the same source/lexicon diff directly.
**Salvar fonte e ground truth** is explicit approval of that displayed review.
Pending publication maps to the returned stable corpus passage before approval;
no stale React selection is reused. Already-saved source offers **Salvar ground
truth** and skips the source write. Duplicate clicks, edits and navigation cannot
interleave while the combined operation is running.

Reference approval still freshly evaluates the published expression and checks
the reviewed surface, source/engine evidence, declared human targets and sequential
ordinal. Literal predicates may be promoted to reviewed shared names without
changing the approved form. Lexicon-only and recovery reviews remain source-only.

If the source write fails, reference approval is never attempted. If approval
fails after publication, the source stays saved, the reason is visible and a new
unchanged-source review can retry only the reference. If corpus approval succeeds
but local completion persistence fails, the app reports that narrower outcome.

## What failed and was corrected

The first browser run passed 17/19; two expectations still searched for the idle
button text during a save. Updating those selectors to **Salvando…** fixed them;
additional source-only/stale-result checks brought the final suite to 21/21.

The previous automatic approval helper read the pre-publication React selection
and explicitly refused pending passage IDs. The old entry dialog also required an
extra navigation step, and no-diff source reviews could not save a reference.
The combined hook operation removes all three gaps.

Review found that reference approval checked filesystem freshness against its
current backend project but did not compare a caller's older engine fingerprint.
A separately refreshed backend could therefore approve an old review if its
surface still matched. Approval now checks the caller fingerprint as well.

## Remaining questions and limits

Source/lexicon application and reference approval remain separate recoverable
backend operations. There is no cross-file atomicity or exactly-once command
receipt across them; the UI reports partial success instead of claiming rollback.
The existing final approval child guards source/reference bytes, not an exclusive
engine lock against a concurrent external filesystem writer.

The standalone old ground-truth panel remains only for legacy test coverage;
no main application entry opens it. No real corpus/lexicon/reference, neighboring
repository or provider was written, and no Git commit/push was made. Earlier
uncommitted changes and the pre-existing generated learning diff (24 additions,
8 deletions) were preserved. Final read-only sibling status shows the engine
clean and the corpus with existing/user work in Araújo source and shared lexicon;
these files were not edited by this task.

## Suggested next prompt

Open a completed draft, click **Commit to Ground Truth**, inspect the passage and
new lexical entries, then use **Salvar fonte e ground truth**. Verify that the
new passage is marked complete with no second confirmation.
