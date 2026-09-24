# Manual predicates and hypothetical roots

## Goal

Make direct predicate creation discoverable alongside search. Allow an author
to describe `ekat` as a pluriform noun or stative verb with unknown meaning and
unattested/hypothetical status, then reuse it through normal reviewed lexical
publication and later form analysis.

## Files inspected

- Required agent guide/current state/repository map/open questions.
- Canvas/palette/search/lexical/review components, authoring/domain types and
  source-backed graph projection; canvas and source-review browser harnesses.
- Python constructor catalog/runtime, lexical publication/planner, reuse index,
  active lexicon, adapter fingerprints and parser-lab lexical/search evidence.
- Read-only selected Pydicate noun/verb/copy/conversion implementations and
  current corpus lexical declarations. No sibling sources were edited.

## Files changed

- `src/components/{ExpressionCanvas,PredicatePalette,PieceSearch,LexicalInput}.tsx`
  and canvas CSS: visible manual action, no-match creation, guided grammatical
  choices, optional meaning and visible hypothetical status.
- `src/components/{AuthoringEditor,PassageLexicon,SourceReviewContent}.tsx` and
  authoring/expression-tree/passage-lexicon domain types: status displayed during
  editing, search, inspection and publication review.
- New `python/lexical_metadata.py`; `authoring_runtime.py`, `authoring_service.py`
  and `adapter.py`: validated explicit grammar, semantic/grammar separation,
  persistent tag provenance, status propagation and freshness.
- `python/{lexical_publication,rendered_structures,active_lexicon}.py`: preserve
  status and exact copy semantics through publication/reuse; reuse index v3.
- Parser-lab lexicon/morphology/search/equivalence/engine: saved hypothetical
  roots and adopted lexical hints remain provisional; realization-tree fallback
  catches verbal annotations omitting tags; uncertainty participates in identity.
- New metadata tests, publication/planner/morphology tests, canvas and review
  browser tests, parser-lab domain assertion; required agent docs/design notes.

Earlier Navarro work remains in the working tree. The pre-existing generated
`src/generated/learning.json` change was left alone. No commits or real corpus,
lexicon, ground-truth, or provider mutations were made.

## Commands run and results

- `npm run typecheck`, `npx vite build`: passed; Vite's existing large-chunk
  advisory remains. Build deliberately bypassed generated learning regeneration.
- `npx vitest run src/domain/parser-lab.test.ts src/domain/expression-tree.test.ts`:
  24 passed.
- `python3 -B -m unittest discover -s python/tests -p 'test_parser_lab*.py'`:
  99 passed, including saved-hypothesis morphology and retrieval regressions.
- Rendered-structure tests: 11 passed. Active-lexicon tests: 4 passed.
- Metadata tests: 10 passed, covering explicit classes, tag preservation,
  source-dependent uncertainty and isolated metadata on returned shared objects.
  Pending-authoring tests: 12 passed on stable rerun.
- Lexical planner: 10 passed plus one source-copy expectation updated to reflect
  the intentional publication fix; that focused test then passed.
- Three hypothetical noun/stative/derived publication lifecycle tests: passed with
  disposable source/lexicon changes, fresh reload and exact noun reuse. Existing
  identical-predicate reuse test also passed on stable rerun. The derived case
  proves an otherwise identical unspecified entry cannot collapse into the
  hypothetical entry; surface/annotations remain those of the selected engine.
  Final stable run: `python3 -B -m unittest python.tests.test_lexical_publication
  -k hypothetical -v`, 3 passed in 50.898 seconds.
- Playwright with `/private/tmp/pydicate-parser-lab-ui.config.ts`, fresh Vite5179:
  all seven focused creation/search cases passed across two runs. Combined
  canvas/source-review suite: 34/37 passed, including new noun, stative and
  unknown-meaning publication review. Three unrelated older cases fail as
  described below. A final five-case run of manual creation, unknown search and
  hypothetical review passed after all runtime fixes.
- Narrow Prettier and `git diff --check`: passed.

## What worked

The actual engine reproduces `tekata`, `xe rekata`, and negative `tekate'yma`
from hypothetical noun `ekat` with `(t)` morphology and a blank public definition.
Stative `ekat` with `(t) adj.` yields `xerekat` with `+ixé`. The UI offers the
grammatical choices directly; code/advanced properties remain available.
Hypothesis status is separate from meaning and editorial approval. A successful
form match is not evidence that the reconstructed root was historically used.
Engine conversions such as `base_nominal()` can erase tags. Private runtime
metadata and static declaration/helper dependencies recover this uncertainty
without changing engine annotations. Conditional helper branches conservatively
retain uncertainty rather than assert which branch executed.

## What failed

- First publication round trip exposed a real duplicate-entry bug: persisted
  constructor plus definition override omitted `studio_define`'s copy. Retaining
  `(constructor).copy()` preserves noun internal links and exact reuse.
- Conversion checks exposed loss of status when the engine replaces a lexical
  object. Source-dependent recovery closes that gap; uncertainty is also part
  of publication identity, even when no engine tag survives the conversion.
- A helper returning an existing shared object could leak newly inherited
  uncertainty to that object. Metadata now attaches to an isolated snapshot,
  preserving self-links and engine shape; the shared object stays unchanged.
- Sandbox initially prevented the temporary browser server binding to5179;
  approved local execution ran the suite. A stale pre-existing Vite5173 process
  was left alone.
- Concurrent runtime edits triggered `STALE_ENGINE` in two background tests;
  stable targeted reruns passed.
- Existing publication compound test assumes unsuffixed `nhemoabare`; current
  sibling lexicon already has that name with a different full Navarro definition,
  so the correct distinct entry receives a collision suffix.
- Two older canvas diagnostics tests expect **Copiar diagnóstico** directly on
  node selection; the existing UI places diagnostics behind its detail/repair
  flow. The third expects literal `padre` in source after base restoration;
  the current corpus correctly supplies the shared `abare` reference instead.
  These older expectations were not changed as part of this feature.

## Remaining questions

- Tested source snapshots: corpus `d72cb771117955454b16c3569de4415a2a6c4a70`
  (already dirty), fingerprint
  `sha256:8d050ecbe740249690b04e91c14bd67c2b124517585b3f3d23f8a2db5aa79fed`;
  engine `09e06b37609f70045160885ac265e7a3997eee2c` (clean), fingerprint
  `sha256:2d843a9a455201c3cc852fcd30ba94cfa583c6f248eb526024177db71c19af24`.
- No historical meaning or attestation of inferred `ekat` was asserted.
- Exact noun and verb hypotheses are separate entries. Unspecified status does
  not imply attestation. Explicit class conflicts with dictionary overrides
  fail instead of silently changing the contributor's hypothesis.
- Source recovery follows static declarations and helper free variables;
  arbitrary computed globals are outside that dependency analysis.
- Restart the desktop process to load backend changes and rebuild old solver
  indices. New roots enter the user's shared lexicon only after their ordinary
  explicit passage/lexicon review.

## Suggested next prompt

“Use Criar peça to enter ekat as a hypothetical pluriform root, compose its
negation, inspect both dictionary and hypothetical readings, and review the
proposed shared lexical addition before applying it.”
