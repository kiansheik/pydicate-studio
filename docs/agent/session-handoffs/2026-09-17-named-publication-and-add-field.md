# Named publication and primary add field — 2026-09-17

## Goal

Replace giant inline dictionary constructors in reviewed source with reusable shared lexical names. Make adding/reusing pieces the primary toolbar interaction, remove redundant add buttons, and provide a focus/select-all shortcut. Default the review to a nontechnical summary with optional exact Git-style diffs.

## Files inspected

- Required agent index/current-state/repo-map/open-questions; dictionary, canvas, next-passage and corpus-authoring contracts.
- Source preview/apply/recovery, runtime namespace/interpreter, rendered identity evidence and adapter fingerprints.
- Read-only actual `historic/lexicon.tu.py` export/load structure and Araújo source structure.
- App review, hook source adoption, canvas/palette/shared lookup, existing source and UI fixtures.

## Files changed

- `python/lexical_publication.py`, `authoring_runtime.py`: literal leaf extraction, exact shared reuse, readable deterministic collision naming, evidence proof, wrapper handling.
- `python/authoring_service.py`, `reviewed_files.py`, `adapter.py`: both-file review, shared export insertion, exact snapshot guards, staged writes/rollback/journals, legacy and interrupted-set recovery, current implementation fingerprint.
- `src/App.tsx`, `src/components/SourceReviewContent.tsx`, `src/domain/authoring.ts`, `src/authoring.css`: human word/field summaries, revision-matched output, compact expandable meanings and optional both-file technical diffs/diagnostics, one combined apply action.
- `src/components/{ExpressionCanvas,PredicatePalette,PieceSearch,LexicalInput}.tsx`, `src/expression-canvas.css`: primary add field, secondary composition search, removed redundant add buttons/bubble, constructor-first secondary palette, app-wide visible-tree Cmd/Ctrl+K focus/select-all.
- `python/tests/test_lexical_planner.py`, `test_lexical_publication.py`; `tests/{canvas,next-passage,source-review}.spec.ts`.
- Agent current-state/log/repo-map/open-questions; next-passage/dictionary/publication contracts; this handoff and [planner handoff](2026-09-17-lexical-planner.md).

## Commands run

- `npm run build`, `npm run typecheck`; targeted Prettier and `git diff --check`.
- `python3 -B -m unittest python.tests.test_lexical_planner -v` — 11 pass, including all 13 actual constructors.
- Nine lexical publication service tests, 12 pending-authoring tests and eight existing source/no-op/recovery/metadata tests — 29 pass; added malformed-recovery case also passes. Four focused human-summary checks pass (two extend earlier cases, two are new), for 32 distinct service/source cases.
- `tests/canvas.spec.ts`, `tests/next-passage.spec.ts`, `tests/source-review.spec.ts` — 34 distinct scenarios pass (25 canvas, five next-passage, four source-review); the final nine passage/review checks were rerun after the human-summary refinement.
- `/tmp/pydicate-named-publication-native.mjs` exercises a temporary-profile production app and disposable corpus; the named-publication run passed at `/tmp/pydicate-named-publication-5mMmJj/`; the final human-summary/toggle run passed at `/tmp/pydicate-named-publication-9wXeog/` (report and screenshots).

## What worked

Service checks compare actual before/after engine surfaces and annotations and preserve full dictionary definitions, verbal IDs/classes and every unrelated source/reference byte. Both-file preview is read-only. Fault injection verifies stale source/lexicon rejection, rollback when the second write fails, recovery after an interrupted/failed rollback, and refusal to overwrite an external edit. Corrupt recovery records no longer hide valid records.

Production Electron verifies an actual Navarro `abaregûasu` selection, a read-only review, publication as `abareguasu` in both the lexicon and passage, preserved surface, and named-source adoption in the saved draft. The default human summary shows current Tupi output/meaning and locator changes with no visible code or paths; the technical toggle reveals both exact diffs and collapses again. Subsequent sidebar-to-search insertion and undo work. Original source/lexicon/reference hashes remain unchanged; no page errors or AI calls.

The shortcut works from outside the tree, selects existing text repeatedly while already focused, and then permits verified insertion. Hidden trees and unrelated modals do not consume it. Manual constructors/code, connection palettes, ordinary gestures and source-only review remain covered.

## What failed

Initial planner proof used the UI interpreter's occurrence-copy mode; `Noun.copy()` changes an internal self-cycle despite identical linguistic output. Proof now uses the actual publication evaluation mode and isolates evidence snapshots. A repeated shortcut initially left a stale insertion epoch after batched dismiss/reopen; explicit intent renewal fixes it. Test-only issues corrected canonical `/private` fixture paths, insertion before `__all__`, an immediate React-state snapshot, and SVG `innerText` (uses `textContent`). Production build retains its existing large-bundle advisory.

## Remaining questions

No provider calls, original corpus application, ground-truth approval, commit or push. Generate a fresh source review for already-existing local inline drafts; obsolete previews are not rewritten. Dynamic constructor expressions remain explicit source code and source-dependent constructor shadows cannot be promoted automatically. Shared multi-file writes have guarded rollback/recovery, not filesystem-wide atomicity. Individual occurrence notes are not relinked merely because equivalent code gets a name.

## Suggested next prompt

Continue the real passage using the primary add textbox and Cmd/Ctrl+K, then inspect its newly generated passage-and-lexicon review. Report friction in the actual lexical naming, combining or review workflow without using live AI for routine checks.
