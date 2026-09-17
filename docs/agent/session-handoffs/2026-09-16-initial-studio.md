# Initial Pydicate Studio — 2026-09-16

## Goal

Create the initial `kiansheik/pydicate-studio` repository from the supplied Markdown design and HTML visual inspiration, with a useful reading desk and first editable authoring slice. The design is a roadmap, not evidence that all proposed stages are complete.

## Files inspected

- Supplied `/Users/kian/Downloads/pydicate-studio-design.md` and `Pydicate Studio.html`. Decoded nested HTML templates in `/tmp/pydicate-design-reference` for visual inspection without running supplied scripts.
- Initial Git status/remotes: empty local repository, no commits, configured GitHub origin. Required `docs/agent/` pages did not exist; created and read the initial guide before code editing.
- Read-only neighboring `oldtupicorpus/historic/*.tu.py`, `historic/lexicon.tu.py`, `ground_truth/records/historic/*.jsonl`, source annotation/record helpers, and relevant `nhe-enga/pydicate`/`tupi` APIs.
- Current source records and annotated engine outputs; prior memory only guided where to find source/record pairing. Local observations replaced older inventory assumptions.
- Current official Electron security documentation and Vite guide for desktop/build boundaries.

## Files changed

The repo was empty; all files are new. See [repo map](../repo-map.md) for ownership.

- Root Node/Vite/TypeScript/Playwright/Prettier setup, lockfile, `.gitignore`, `Makefile`, README, AGENTS and GitHub CI.
- `src/App.tsx`, `useStudio.ts`, `components/`, `domain/`, styles and original SVG mark.
- `electron/` main/preload/validation/atomic draft store/worker client and focused tests; `scripts/` development, compiled launch and native smoke.
- `python/` AST project adapter, JSONL worker, fresh engine renderer, snapshot utility and 16 tests.
- `tests/` browser workflows and isolated hook harness; checked-in example excerpts/evaluation snapshots with provenance.
- `docs/design/` supplied brief, implementation boundaries, operation inventory, observed compatibility record and desktop screenshot.
- All required agent state, map, open questions, log and this handoff.

No source, record, engine file, Git index or remote in neighboring repositories was modified. Nothing was committed or pushed in Studio.

## Commands run

- Targeted `rg`, file reads, `git status --short --branch`, `git remote -v`, and read-only Git revision/content inspection for the dependency pair.
- `npm install` with explicit version fixes, then patched Vite to 7.3.6 and overrode esbuild to 0.28.1 based on npm's advisory report. Final install audited 112 packages with zero known advisories.
- `npm run format`, `npm run format:check`, `npm run build`, `npm run check`.
- `python3 -B -m unittest discover -s python/tests -v` and `python3 -B python/snapshot.py --parent /Users/kian/code`.
- `npm run test:e2e` after final dependency/build changes.
- `npm run test:smoke -- /Users/kian/code` against the final production build, with temporary isolated application data and test-only native picker stubbing.
- `git diff --check`, source-only repository status and documentation link checks.

## What worked

- All 54 automated tests pass: 15 domain, 10 desktop service, 16 Python, 13 browser workflow/hook tests. Production build and formatter pass.
- Native Electron verifies custom `studio://` origin and CSP, sandbox/context isolation, no renderer Node globals, a user-selected local scan image, a diplomatic draft surviving app close/reopen, native project opening, 122 real historic passages and live `eporoapiti umẽ` realization.
- Eight combinations of subject visibility, imperative/indicative mood and outer negation were evaluated with real Python and recorded with exact repository/runtime fingerprints. Browser mode uses these clearly labeled examples.
- Reading/translation/note drafts save without a complete formal analysis. Baselines never change when drafts do. Export records original reference/source, current draft/evaluation and null editorial approval.
- Undo, stale render filtering, failed saves, rapid edits, project transitions, reloads, failed-load retries, damaged draft storage and orphan retention are covered by behavioral tests.
- Desktop and mobile viewport screenshots were inspected. Desktop actions remain visible; narrow screens start on the analysis, center the selected passage and expose a source toggle. No horizontal page overflow.

## What failed and how it was resolved

- Initial npm install selected incompatible React DOM types; pinned compatible types. Network-restricted dependency requests failed; authorized network-enabled installation succeeded.
- Local dev-server and GUI checks required sandbox escalation; automatic review allowed the tests. No unresolved approval block remains.
- Inherited `ELECTRON_RUN_AS_NODE=1` prevented Electron launch; launchers/test bootstrap remove that variable.
- Review found project-open/save races, empty imports and failed-load retry issues; fixed them and added focused regressions.
- The first UI placed actions below the viewport and started mobile on a long source pane; pane scrolling, sticky actions and a source toggle corrected that behavior.

## Remaining questions

- Both actual engine/corpus working copies are dirty. Their hashes identify the tested state; HEAD revisions alone do not reproduce it. A clean compatible contributor environment and bundled/managed Python runtime remain stage-0 gates.
- Reading 122 expressions is not full corpus execution. Only the eight 0067 configurations have live realization/structural checks; broader grammar, lexical lookup, lossless editable source representation and source export/reimport remain open.
- External expression rewrites get new Studio IDs; prior drafts are preserved and exportable, but durable canonical identity and reassociation UI are not implemented. Legacy references are paired by ordinal and cannot prove source correspondence after arbitrary reordering.
- Source attachments/page choices are session-only; printed/PDF page mapping and regions are not persisted. Native image consultation was tested; PDF consultation uses the browser's embedded PDF viewer and was not included in native smoke.
- Editorial approval, immutable review events, AI providers, Git synchronization, managed installer and colleague task acceptance are not implemented. GitHub CI is configured but not remotely exercised.

## Suggested next prompt

“Establish a clean, reproducible engine/corpus baseline for Pydicate Studio, then implement a lossless Araújo 0067 source adapter with lexical lookup and explicit conflict review. Preserve the current independent draft/reference contract and do not mutate accepted corpus references.”
