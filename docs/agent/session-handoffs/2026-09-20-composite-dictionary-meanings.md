# Dictionary meanings for existing compositions

## Goal

Let the contributor register an already composed word with its dictionary meaning
while preserving all internal elements and their meanings. The motivating form is
`tekate'yme'yma`; extend both the Canvas composition dialog and the existing
local/general Léxico definition editor.

## Files inspected

Required agent docs; dictionary, node interpretation and publication contracts;
Canvas and Léxico editors; source-tree definition and lexical publication
services; dictionary website identity/search; relevant browser/Python harnesses.
Read actual local Navarro data and the live Araújo/lexicon declarations for
evidence. The user independently changed those corpus declarations during this
turn; this implementation did not write any neighboring repository.

## Files changed

- `src/components/DictionaryMeaningPicker.tsx` and CSS: shared form/meaning
  consultation, full exact senses, contextual excerpts, pagination and stale
  response invalidation.
- `src/components/PassageLexicon.tsx`: exact dictionary selection in local/general
  definition editors; manual edits clear the row/checksum binding.
- `src/components/ExpressionCanvas.tsx`: rendered-form consultation in the
  composition dialog, selected whole meaning with no base restoration, and
  cancellation/unmount/source/revision/engine guards for asynchronous edits.
- `python/navarro_search.py`: optional field filtering, matched field and bounded
  original-text excerpt; existing default ranking and pagination retained.
- `python/authoring_service.py`: authoritative selected dictionary meanings and
  before/after dataset validation for three existing definition operations;
  composition selection uses the existing grammar-preserving node editor.
- `python/tests/test_dictionary_definitions.py`: ten focused service/search and
  actual-engine publication regressions.
- `tests/passage-lexicon.spec.ts`, `tests/canvas.spec.ts`,
  `tests/composition-freshness.spec.ts`, `tests/canvas-harness.tsx`: dictionary
  meaning, example, undo and asynchronous editing regressions.
- Current state, log, repository map, contributor guide, dictionary and node
  interpretation contracts, plus this handoff.

## Commands run and results

- `python3 -B -m unittest python.tests.test_dictionary_definitions
  python.tests.test_dictionary_authoring.SiteDictionaryTests
  python.tests.test_scoped_authoring.ScopedAuthoringTests.test_dictionary_pages_and_full_nonverbal_sense_preserve_identity -v`:
  **14 passed**, 31.115 seconds.
- `python3 -B -m unittest
  python.tests.test_node_definitions.NodeDefinitionTests.test_repeated_leaf_override_changes_only_one_occurrence_and_can_be_replaced_or_removed
  python.tests.test_lexical_publication.LexicalPublicationTests.test_compound_definition_restores_base_and_publishes_whole_structure -v`:
  **2 passed**, 35.819 seconds. Total **16 distinct Python checks**.
- `npx playwright test --config /private/tmp/pydicate-parser-lab-ui.config.ts
  tests/passage-lexicon.spec.ts`: **14 passed**, 14.6 seconds. Includes four new
  dictionary cases, semantic search, scope/manual changes and delayed queries.
- `npx playwright test --config /private/tmp/pydicate-meaning-canvas.config.ts
  tests/canvas.spec.ts --grep 'Navarro|whole-composition definition'`:
  **6 passed**, 28.4 seconds. Uses the actual local dictionary and engine with a
  simulated browser transport; verifies tree/constituent retention and undo.
- `npx playwright test --config /private/tmp/pydicate-meaning-canvas.config.ts
  tests/composition-freshness.spec.ts`: **7 passed**, 5.6 seconds. Simulated
  responses cover valid apply/undo, cancellation, unmount, changed engine,
  mismatched returned revision/engine and overlapping requests. Total browser
  coverage for this change: **27 distinct checks**. Final `npx tsc -b` passed.
- `npm run typecheck && npx vite build`: **passed**; existing large-chunk advisory
  remains. Generated learning was deliberately not rebuilt.
- Scoped Prettier and `git diff --check`: passed. Pre-existing
  `src/generated/learning.json` changes remain 24 additions/8 deletions.
- Inspected the actual Navarro result at a 480px picker width in
  `/private/tmp/pydicate-dictionary-meaning-picker.png`, with full-entry/desktop
  variants alongside it. Normal pane scrolling exposes the full entry without
  clipping. Capture made no mutation calls; temporary Vite servers stopped.

## What worked

The local Navarro snapshot contains the requested form inside the `ekate'yma`
example, not as its own headword. Its example translation supports “liberalidade”
while the containing entry's headword meaning is “avareza”. Form consultation
shows that evidence without supplying a misleading copy action. Explicit meaning
search separately allows choosing a full named dictionary sense. All definition
routes preserve morphology and nested meanings; publication/reopen tests verify
portable composed entries and ordinary general-entry edits in disposable copies.

## What failed or changed during verification

Initial Python failures were fixture assumptions about shifting absolute source
offsets and incomplete synthetic service state; corrected tests pass. The first
Canvas check incorrectly expected the base `potar` gloss in Portuguese; the
engine currently supplies English. It now compares actual before/after meanings.
The new asynchronous fixture's successful edit includes protective parentheses;
its expected source was corrected to match that existing Canvas behavior.
Independent review found a missing deliberate semantic-search route and Canvas
unmount/engine/returned-evidence gaps; the final implementation addresses them.
The sandbox initially refused the local test-server bind; approved test execution
with escalation succeeded. No automatic approval rejection occurred.

## Remaining questions and limits

- Example translations remain contextual evidence; the contributor supplies an
  isolated word interpretation. There is no automatic gloss extraction from an
  example or assertion of an independent historical headword.
- Full selected definitions/citations persist through source publication. Exact
  row/checksum remains preparation-time evidence, as in the prior dictionary
  contract; this change adds no durable dictionary-provenance schema.
- No live provider inference, real corpus publication, neighboring changes,
  commits or pushes occurred. Relaunch the desktop main process to load the
  updated Python service. Existing translation context consumes the same scoped
  meanings; no provider protocol changed.

## Suggested next prompt

“Use Consultar Navarro on the composed tree, choose or revise its meaning, and
review the resulting reusable lexical entry while checking constituent meanings.”
