# 2026-09-18 — Hidden Tupi → Pydicate laboratory implemented

## Goal

Execute the [implementation assignment](../../design/tupi-parser-lab-implementation.md)
on `codex/tupi-parser-lab`: a hidden experimental workspace that turns a
normalized Tupi string into a validated Pydicate analysis, with reproducible
artifacts, a real small training/evaluation cycle and a native end-to-end proof.
Not merged to main.

## Environment finding

The user's sibling repositories are **newer than the recorded baseline and
clean**: `nhe-enga@09e06b37`, `oldtupicorpus@d72cb771`. `scripts/check-project.py`
reports the differences, and the documented dependency patches are already part
of those revisions. The research probe runs against them unpatched
(`python -B scripts/experiments/probe-parser-lab.py --parent /Users/kian/code`,
0.6 s, 145 fragments, 60/60 recovered). No sibling repository was modified; the
native smoke works on a disposable clone with the engine symlinked read-only.

## Added

- `python/parser_lab/`: `normalization` (`lab-v1` profile), `engine`
  (answer-free lexicon-only context, memoized surfaces, morpheme units),
  `grammar` (five declared families, four root rules), `projection` (stable
  source-AST projection and serializer), `index`, `search` (retrieve → compose →
  rank → validate, bounded), `ranker` (pure-stdlib pairwise logistic),
  `datasets`, `artifacts`, `jobs`, `evaluation`, `judgments`, `neural`, `agent`,
  `worker` (persistent NDJSON process).
- `scripts/parser-lab/cli.py` with `prepare|train|evaluate|analyze|status|activate`;
  recipes in `configs/parser-lab/{smoke,baseline,large}.json`.
- `electron/parser-lab-service.cjs`, routed from `next-service.cjs` by the
  `parser_lab_` prefix; `main.cjs` supplies the project parent.
- `src/components/ParserLab.tsx`, `src/domain/parser-lab.ts`,
  `src/domain/parser-lab-fixtures.json`, `src/parser-lab.css`; the switch lives
  in App's project information panel under **Recursos experimentais**.
- Tests: `python/tests/test_parser_lab.py` (46),
  `electron/tests/parser-lab-service.test.cjs` (10),
  `src/domain/parser-lab.test.ts` (11), `tests/parser-lab.spec.ts` (7, real
  Python laboratory worker, including a context-menu tree gesture),
  `tests/parser-lab-shell.spec.ts` (4, App shell).
- `scripts/smoke-parser-lab.mjs` (`npm run test:smoke:parser-lab`) and its
  report at `docs/coverage/parser-lab-native.json`.
- `docs/design/parser-lab.md`; `python/README.md`, `docs/agent/repo-map.md` and
  `current-state.md` updated.

## Native evidence (11/11 stages, isolated Electron profile)

| Stage | Evidence |
| --- | --- |
| `hidden-by-default` | No entry point; `userData/parser-lab` does not exist |
| `enable-persists-across-restart` | Switch persists; revealing it still creates no state |
| `prepare-baseline-from-the-tab` | 42 fragments, 1923 retrieval rows, 129 recorded expressions, 258 examples; activated explicitly |
| `first-sentence-offline` | `asoxerokype` → `(+ixé * só) + (pe * (ixé * oka))`, `asó xe rokype`, engine tags, real tree |
| `variants-and-unknown-input` | Three variants agree; `zzzz` and `Açó xe rokîpe` are unknown |
| `composes-a-sentence-absent-from-the-index` | `ereso nde rokype`, `knownExpression: false`, route `composition` |
| `tree-edit-changes-source-and-surface` | Code edit → `asó nde rokype`; a real right-click **Escolher variante…** gesture rewrites the source; undo and redo |
| `ambiguity-and-collisions-preserved` | neural `blocked` (missing `transformers`), agent `ran: false` |
| `train-and-evaluate-survive-a-reload` | Ranker and evaluation artifacts complete after reload |
| `cancellation-and-interruption-are-honest` | A `large` preparation is cancelled mid-generation; never reports success, never becomes a complete artifact, leaves an inspectable staging leftover that the tab discards, and the active index survives |
| `corpus-untouched` | Three watched files byte-identical |

Screenshot: `docs/coverage/native-screenshots/parser-lab-first-result.png`.
`pageErrors: []`. No provider call, no publication, no approval.

## Measured results worth keeping

- Baseline profile (5 families, 11 812 examples, 11 568 groups): reconstruction
  on the test split is top-1 1.0 with the answer removed from retrieval —
  expected for synthetic composition, **not** historical accuracy.
- Held-out suites are reported twice. With the reserved resource still in the
  index they are ~1.0; with `taba`/`suí` or `negated_clause` removed, 25/25 come
  back `unknown`. The declared searcher does not invent lexemes or families, and
  that is now the documented generalization boundary.
- Ranker on the full train split: 88 contrast pairs, of which 86 are symmetric
  (`(pe * apé)` ↔ `(pe * (ae * apé))` both realize `sapepe`). Dev pairwise
  accuracy 0.5 equals the baseline, `recommendActivation: false`. The
  deterministic ordering stays active; the artifact records why.

## Checks run

`npm run format:check`, `tsc -b`, `npm run build`, `vitest run` (147 passed),
`npm run test:desktop` (197 passed),
`playwright test tests/parser-lab.spec.ts tests/parser-lab-shell.spec.ts`
(11 passed), `node scripts/smoke-parser-lab.mjs /Users/kian/code` (11/11 stages),
and `python -m unittest discover -s python/tests` (215 tests).

### Pre-existing Python failures, not regressions

The repository-wide Python suite ends `FAILED (failures=4, errors=7)` on this
branch. Every one of them is already failing on clean `main` with the selected
(newer) dependency revisions. Verified by running the same modules in a separate
`main` worktree: `test_step_evaluation` fails there on its own
(`FAILED (failures=1)`), and the other five modules give
`Ran 69 tests … FAILED (failures=3, errors=7)` with the identical test names.

| Module | Outcome on this branch | Outcome on clean `main` |
| --- | --- | --- |
| `test_authoring` | 1 error, 1 failure | same |
| `test_legacy_composite_review` | 5 errors | same |
| `test_partial_evaluation` | 1 error | same |
| `test_lexical_publication` | 1 failure | same |
| `test_runtime_tree` | 1 failure | same |
| `test_step_evaluation` | 1 failure | same |

`python/README.md` is the only pre-existing Python file this branch modifies;
everything else under `python/` is a new file, so these cannot be caused by the
laboratory. `python/tests/test_parser_lab.py` passes 46/46. No historical source
or approval was rewritten to make anything green.

## Remaining questions

- No frozen reviewed historical laboratory set exists, so the suite that would
  measure usefulness on real text reports `total: 0`.
- The neural ByT5 recipe is documented and dependency-checked; `transformers` is
  absent here, so it was never trained. Agent escalation was never invoked.
- Composition currently proposes constituents by concatenating fragment keys
  (both surface orders). Validation makes that sound, but recall for
  context-sensitive realizations is unmeasured.
- The `large` profile (up to 1M examples) is committed and is started (then
  cancelled) by the native proof, but was never run to completion.
- A cancelled job leaves an inspectable staging checkpoint and a discard action;
  resuming from that checkpoint is not implemented — a rerun starts over.

## Suggested next prompt

Collect a small reviewed historical laboratory set from Araújo passages the
laboratory can already represent, label it explicitly, and report the
`frozen_reviewed_historical` suite with real denominators — then decide whether
a proposer beyond the declared grammar is justified by that evidence.
