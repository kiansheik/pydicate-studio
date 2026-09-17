# Dictionary UI subtask

Goal: retain the actual local dictionary in its own tab and turn exact selected senses into revision-bound pieces, sharing ambiguity handling with the add-piece search.

Inspected: agent guide/current-state/repo-map/open-questions, existing lexical inputs and predicate palette, authoring RPC helper, App insertion call site, useStudio insertion guard, and backend/bridge contracts supplied by their owning agents.

Changed: new `DictionaryTab.tsx`, `DictionaryEntryCreation.tsx` and corresponding CSS; new dictionary harness/browser spec; one focused `insertPiece` hook regression in `tests/next-passage.spec.ts`. Root owns App/useStudio/desktop hosting; other agents own dataset conversion, injected dictionary bridge and palette integration.

Contract: lazy iframe title `Dicionário de tupi antigo`, sandbox `allow-scripts allow-same-origin`, retained across ordinary hide/show and passage changes. URL requires `studio://dictionary/nhe-enga/`, project ID and matching SHA-256 dataset pin. Messages require that exact origin and iframe window, four exact fields, a bounded nonnegative integer row index and the currently pinned dataset. Explicit refresh reloads status/site after dictionary edits. Conversion uses `dictionary_predicate`; complete known senses insert directly, ambiguous senses show Portuguese constructor choices, partial candidates require a diagnostic-labeled insertion action. The shared chooser binds selection to editing context and expected revision and discards late responses.

Checks: whole-project TypeScript passed. Six focused browser cases passed: iframe retention/sandbox, strict message boundary, ambiguity/partial handling, changed-revision/hidden-tab cancellation, conversion/insertion failure recovery, and main-vs-loose-piece insertion with one-step undo. Formatting and targeted whitespace checks passed. The browser bridge and conversion responses in these six cases are intentionally simulated; actual custom-protocol hosting, exact dictionary data and native integration are covered by the parent/other agents. No AI or corpus writes.

Commands: `npx tsc -b`; `npx playwright test tests/dictionary-tab.spec.ts tests/next-passage.spec.ts --grep 'dictionary|ambiguous senses|delayed conversions|failed conversion' --output=test-results/dictionary-tab`; focused Prettier and `git diff --check`.

An initial test-only type issue was resolved before execution: an optional `constructor` field conflicts with JavaScript's inherited Object constructor in typed object literals, so the unused field was removed from the UI's result projection. No production test failed in this dictionary UI run.

Remaining: native protocol/site verification, real palette aggregate, final design/current-state/log and combined handoff belong to root. Suggested next prompt: search the same homograph in both Dicionário and Adicionar peça, select distinct senses, and confirm their definitions and preserved search state match expectations.
