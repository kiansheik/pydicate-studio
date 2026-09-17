# Dictionary conversion backend and integration review

## Goal

Reuse the actual local nhe-enga dictionary in Studio and convert a selected sense into a source-backed tree piece. Keep rendered-structure reuse ahead of new dictionary entries. Preserve exact source identity, grammatical class and full definition without provider calls or neighboring repository writes.

## Files inspected

- `python/navarro_search.py`, `authoring_service.py`, `authoring_runtime.py`, existing dictionary/constructor tests.
- Selected engine `index.html`, `js/index.js`, `docs/dict-conjugated.json.gz`, dictionary SQLite and Pydicate verb constructor/data, read-only.
- `electron/dictionary-site.cjs`, `dictionary/transform.cjs`, `dictionary/bridge.js`, `main.cjs`, dictionary service/browser tests.
- `src/components/DictionaryTab.tsx`, `DictionaryEntryCreation.tsx`.

## Files changed in this subtask

- `python/navarro_search.py`: exact served-gzip loader/checksum, indexed dictionary search and conservative leading-class hints.
- `python/authoring_service.py`: `dictionary_lookup` and `dictionary_predicate`, source-context/freshness checks and post-conversion dataset recheck.
- `python/authoring_runtime.py`: bounded constructor conversion, exact verbal sense validation and definition-preserving proper-name occurrence.
- `python/tests/test_dictionary_authoring.py`: synthetic identity/freshness/class tests and actual selected-engine conversion checks.
- This handoff. Root/UI agents own site hosting, integration and general docs.

## Contracts and important findings

The embedded site reads `docs/dict-conjugated.json.gz`. Its original zero-based array position plus SHA-256 of the compressed bytes identifies a selection. Do not substitute SQLite `vid` or the obsolete similarly named `.json` dataset: the inspected `tym` row is 10617 in the served/engine gzip but 10618 in SQLite and the older file.

`dictionary_lookup` accepts `query` and optional `limit` (1–40), returning distinct entry descriptors with `entryIndex`, `datasetFingerprint`, headword, sense number, full definition, grammatical information and optional suggested constructor. Spaces, case, Unicode composition and apostrophe style normalize; accent relaxation is explicitly labeled. Portuguese definitions are searchable. It launches no engine child process for typing.

`dictionary_predicate` accepts the entry index/checksum, editing context and optional explicit constructor. It returns `ready`, `needs-choice` or `unavailable`. A clear leading class can select a supported constructor; absent/ambiguous classes require a human choice. `(s)` remains a pluriform marker and is not confused with noun label `(s.)`. Body examples cannot determine the entry's class.

Verbs require an exact match of form, sense number, full definition and verbal class against the selected engine, then pin that engine's real `vid`. A conflicting/missing match is refused rather than replaced with a homograph. `ProperNoun` currently ignores its definition argument, so conversion uses a portable `studio_define(...)` copied occurrence to retain the selected definition. Partial realization remains explicitly partial. Conversion does not create a shared lexical source declaration or approve ground truth.

Entry response metadata retains the source index/checksum; expressions retain headword/full definition and verified verb ID. If callers persist only the expression, nonverbal index/checksum remain conversion-time provenance rather than draft metadata.

## Commands and results

- `python3 -B -m unittest python.tests.test_dictionary_authoring python.tests.test_navarro -v`: 11 checks passed, including four distinct actual `pysyrõ` senses, noun/postposition/number, explicit class choice, wrong-engine refusal, forged caller data, stale checksum and read-only source/dataset hashes.
- `git diff --check`: passed.
- Read-only real service lookup timing: first query 0.588 s; warm queries 0.274 s and 0.261 s, including freshness checks.

No test failed. Initial exploration confirmed that the obsolete `.json` file is itself gzip bytes; the served `.json.gz` is authoritative.

## Independent integration review

Review found three concrete issues: the React status validator rejected the required dataset query parameter; the site's required asset list omitted `neologisms.csv`, although actual startup awaits it; and an already-open stale dictionary lacked a visible refresh action. Root/UI agents fixed all three. Actual local asset paths, citation books, isolated host/CSP and development parent configuration were reviewed without modifying their files.

Root separately reported a passing production native check: exact sense insertion plus another loose sense, undo/restart, an inline citation scan, zero HTTP/S requests and unchanged original file hashes. Those native checks were performed by root, not rerun in this subtask.

## Remaining questions / next prompt

Neologism rows lack the verified Navarro dataset identity and remain consultation-only. Ambiguous dictionary classes remain contributor decisions. No provider calls, original source/reference/dataset edits, commit or push occurred.

Suggested next prompt: "Try the shared piece search and dictionary on the next real passage; report any ambiguous class choices or composition steps that still require unnecessary actions."
