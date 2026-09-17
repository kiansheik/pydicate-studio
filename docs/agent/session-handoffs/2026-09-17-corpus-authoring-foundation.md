# Corpus authoring foundation handoff

## Goal

Replace Studio's fixed imperative-only Python slice with a source-preserving, context-faithful authoring foundation for every current Araújo expression, lexical authoring and a concrete review/apply/approval loop.

## Files inspected

Required agent docs, design scope/operation inventory, previous adapter and tests; the entire Araújo source and canonical lexicon; corpus lexicon wrapper, authoritative annotations/records/service/ground-truth case code; selected engine predicate and noun/verb/composition/copula/postposition/number/deverbal implementations. Current corpus/engine status and recent history were inspected read-only. Root inspected the other project histories.

## Files changed

`python/adapter.py`, `worker.py`, `README.md`, `tests/test_adapter.py`; new `studio_authoring.py`, `authoring_runtime.py`, `authoring_service.py`, `audit_araujo.py`, `tests/test_authoring.py`; complete `docs/coverage/araujo.{json,md}`; actual dependency file manifest `docs/design/next-baseline.json` and binary dirty patches under `docs/design/dependency-patches/`; this handoff and `docs/agent/corpus-authoring.md`. Local relevant-file archives are deliberately gitignored under `.local/dependencies/`. Also updated `electron/main.cjs`, `next-service.cjs`, `python-worker.cjs` and added `project-watch.cjs` plus focused tests on delegated integration followup. Source-write timers now close cleanly; source apply and approval suppress their own watch notifications, and recovery previews are never adopted as projects. Root owns the Navarro module, remaining app integration and aggregate current-state/log updates.

## Commands run

- Targeted `rg`, `git status --short`, recent `git log`, source/engine file reads.
- Actual source import via `runpy.run_path` in fresh Python.
- `python3 -B python/audit_araujo.py` (repeated after fidelity changes).
- `python3 -B -m unittest discover -s python/tests -v`.
- Narrow `test_authoring.py` runs while developing disposable-copy mutations.
- Read-only snapshot/manifest generation using `git ls-files`, `git diff --binary HEAD` and archive capture; no index or original-file writes.

## What worked

42 Python tests passed after atomic approval, metadata idempotence/conflict fingerprinting and recovery discovery were added. Three targeted Electron tests passed for watcher cancellation/suppression, later external events and the recovery-preview/project-adoption contract. A final narrow parser regression covers comment-only incomplete work. The current read-only audit discovers 82 entries; all compare to direct selected-engine import in source structure, surface, annotations and runtime graph including principal/cycle links. All concrete no-op source bytes, card encoding and span edit/reimport checks pass. These are distinct from per-expression UI workflow verification.

Disposable-copy tests cover source preview/apply/restart/recovery, source conflicts, interrupted replacement, original repeated-expression identity, explicit IDs after insertion, actual complex realizations and source-order `.definition` context, helper templates/signatures, copied lexical gloss portability, stable shared-definition identity, new lexical entries and new passages, incomplete AI context, protected sequential approval and explicit next-reference approval. Positive approval preserved all previous 80 record lines and appended only the reviewed next record.

## What failed and was fixed

Initial authoring module name collided with the corpus's `authoring` package; renamed to `studio_authoring.py`. Collection elements required their implicit list continuation context. `cop` is a class alias, so callable handling was corrected. Preview persistence originally retained a string path; corrected. Import initially omitted human source notes; authoritative notes now return while machine notes are filtered. Original sidecar policy orphaned unchanged repeated expressions on unrelated source edits; sequence reconciliation and dedicated regressions fix unambiguous cases. Callable inspection originally exposed unsupported lambda nodes; signature/body/prerequisite views now preserve helper structure. Coverage originally overstated a span probe as visual editing proof; measures are explicitly separated.

## Remaining questions

An external insertion of another identical unmarked expression is intrinsically ambiguous and requires explicit draft reassociation. Source-adjacent IDs resolve reviewed passages. Multi-statement helper implementation editing remains raw Python; return templates and prerequisites are inspectable. Exact UI family workflows and authenticated provider/PDF integration evidence belong to root's independent critic/integration rounds. No full visual or scholarly-equivalence claim follows solely from the 82-row engine audit.

## Suggested next prompt

Review the final contributor and persistence critic results, verify their fixes against the real UI, rerun the complete Araújo audit after any adapter changes, and continue with a disposable corpus copy before enabling explicit historical-source application in daily use.

## Reserved pending-passage followup

`source_new_preview` now accepts a canonical reserved `passage:UUID`, rejects existing IDs, and preserves a validated version-1 PDF pointer matching that ID. Explicit printed-page, folio and textual-line fields use the authoritative directives. Three focused disposable-copy regressions passed for reserved ID/evidence/locators/restart, invalid or mismatched identities, and explicit clearing of source scholarly fields without resurrecting legacy metadata. Accepted reference targets remain unchanged by those metadata clears.

## Multiline source anchor followup

The independent native UI review found that Araújo rows 28/29 begin with a physical opening parenthesis before their first AST token. Metadata insertion at the AST line overlapped the concrete expression replacement. `source_entries` now records the physical opening line; reviewed source changes anchor comments there and join only a whitespace-only leading parenthesis prefix inside the edited expression. This preserves the AST and every comment while making metadata visible to the unchanged upstream parser. A comment-containing prefix remains saved as a draft with a specific manual-review diagnostic. Untouched no-op source remains byte exact.

`python3 -B -m unittest discover -s python/tests -v` passed 48 tests in 69.010 seconds. A strengthened targeted `test_authoring.py -k all_araujo_scope` run also passed: every one of the 82 negated expression previews preserves unrelated bytes and expressions, and the upstream metadata parser reads the new note plus the same stable ID. Rows 28/29 additionally passed disposable apply/restart with note and translation reimport, unchanged inherited locators and inline comments, and repeated empty diffs. No historical source was written. The Navarro suite emitted a non-failing unclosed SQLite connection ResourceWarning; parent owns that module. Python is frozen for the next native UI review.
