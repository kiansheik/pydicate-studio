# Dictionary bridge and unified add-piece search

## Goal

Preserve the actual local nhe-enga dictionary interface while connecting an exact selected sense to Studio. Make the canvas add-piece palette start with one natural query, listing reusable structures before Navarro entries; keep manual predicate construction available.

## Files inspected

- Required agent index, current state, repository map and open questions.
- Read-only neighboring `nhe-enga/index.html`, `js/index.js`, `styles.css`, compressed dictionary and primary-source viewer.
- Studio `LexicalInput`, `PredicatePalette`, `ExpressionCanvas`, canvas browser harness/tests, dictionary runtime/search contracts and shared `DictionaryEntryCreation`.

## Files changed

- `electron/dictionary/{transform.cjs,bridge.js,bridge.css}` and `electron/tests/dictionary-transform.test.cjs`.
- `src/components/{LexicalInput,PredicatePalette,ExpressionCanvas}.tsx`, `src/lexical-input.css`.
- `tests/canvas.spec.ts`, new `tests/dictionary-bridge.spec.ts`.

Parent/other agents own local hosting, dictionary conversion, shared selected-sense review, application integration and overall documentation.

## Behavior

The served copy of the original dictionary script carries its compressed row offset into each result. A strict four-field selection message includes that offset and the gzip SHA256 fingerprint. Headword clicks and an added **+ Árvore** button select that exact row; no spelling-based sense inference occurs in the bridge. Conjugations, related searches, rich definitions and local citation viewing remain original. Citation scans open in an overlay and return without losing the search. Unmapped neologisms remain available for reading with an explicit unavailable insertion action. Analytics and remote font imports are removed from the served copy only.

The palette defaults to its shared Tupi/Portuguese query. Project structures precede distinct Navarro senses; selecting a dictionary result uses the same conversion/review component as the full dictionary tab. Missing grammatical classification requires an explicit constructor choice. Query text persists locally across palette reopen. Manual constructor cards and explicit code are secondary tabs. Search cancellation, context changes, errors and raw-source separation retain the existing shared lookup behavior.

## Commands and results

- `npm run typecheck` — passed.
- `node --test electron/tests/dictionary-transform.test.cjs` — 5 passed, including current neighboring source compatibility.
- `npx playwright test tests/canvas.spec.ts tests/rendered-lookup.spec.ts tests/dictionary-bridge.spec.ts` — 28 passed.
- Targeted formatter runs and `git diff --check` — passed.

Browser checks exercise real Python conversion of classified `abá²` and explicitly classified `abá¹`, verify full sense definitions, query persistence, reusable-first ordering, and all previous canvas/lookup safeguards. The actual local dictionary check verifies four `pysyrõ` senses, exact row selection, conjugations, scan overlay, preserved query and zero external requests.

## What failed and was fixed

Closing the query suggestions on input blur moved the palette's Cancel button between pointer-down and pointer-up, preventing cancellation. Inline palette results now remain visible on blur; scoped autocomplete behavior elsewhere is unchanged. A test initially read inherited JavaScript `constructor` instead of checking its own-property presence; the assertion was corrected.

## Remaining questions

The bridge deliberately fails visibly when its narrowly verified upstream script anchors change. Unmapped neologisms, external transcriptions and unrelated site sections are not editable through this bridge. Native desktop production validation belongs to the parent run. No provider calls, neighboring writes, historical corpus writes, commits or publication were performed by this subtask.

## Suggested next prompt

Use the dictionary tab and default add-piece search on a real passage, then report any sense-selection, placement or navigation friction.
