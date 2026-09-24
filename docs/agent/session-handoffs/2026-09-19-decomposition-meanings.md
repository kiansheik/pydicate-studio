# Deeper analyses with meanings at each scope

## Goal

Keep the successful Navarro noun reading for `moropotara`, continue into a
productive constituent tree, and preserve both its component meanings and the
dictionary meaning of the whole. Carry nested meanings through inspection,
publication/reload and Studio translation/analysis prompts.

## Files inspected

- Required agent index/current-state/repo-map/open-questions and relevant prior
  handoffs; selected engine/corpus instructions and sources, read-only.
- Parser-lab morphology/search/equivalence/index/engine and real-engine fixtures.
- Runtime source trees, declaration loading, predicate copying and nominalization,
  lexical publication/planner and source publication regression.
- Both suggestion views, canvas inspector, source/runtime projection and tests.
- Provider, agent and scratch prompt/context transport, reconstruction withholding.
- Native Pydicate semantics/prompt generation, which discard some source scopes
  and prefer English database glosses; these sibling APIs were not edited.

## Files changed

- `python/parser_lab/{morphology,search,equivalence,engine}.py`: bounded generic,
  reflexive and reciprocal nominalizations, causative chains, exact surface-linked
  dictionary meanings, scoped lexical evidence and decomposition provenance;
  opaque/decomposed trees remain distinct despite flattened noun annotations.
- New `python/semantic_context.py`; `authoring_runtime.py`, `adapter.py`: bounded
  meaning hierarchy, source IDs/spans, verified declaration expansion and runtime
  fingerprinting. Helpers are not replayed to fabricate a semantic history.
- `python/lexical_publication.py`: canonical source meaning scopes participate in
  composite identity/reuse; registered aliases keep those scopes during planning.
- `electron/{provider-service,agent-runner,scratch-service,analysis-input}.cjs`:
  nested context in prompts, exact selected-constituent scope, hidden-answer
  withholding, and interpretation guidance for lexicalized whole meanings.
- `src/components/{ExpressionCanvas,PassageSolver,ParserLab}.tsx` and
  `src/domain/{authoring,expression-tree,runtime-tree,parser-lab}.ts`: scoped
  inspector meanings, direct/decomposed labels, full linked dictionary meanings,
  nested constituent links and explicit hypothesis/empty-morpheme wording.
- Python morphology/equivalence/planner/publication tests, new semantic tests,
  provider/input/domain tests and focused solver/canvas browser scenarios.
- Current state, log, repository map, remaining questions and parser-lab contract.

Earlier Navarro/hypothetical-root work remains uncommitted in the same tree.
The pre-existing generated learning change (24 insertions/8 deletions) was left
alone. No real source, shared lexicon, reference, sibling engine or provider was
mutated; all publication checks use disposable corpus copies.

## Commands run and results

- `npm run typecheck && npx vite build`: passed on final UI; existing Vite
  large-chunk advisory remains. `npm run build` was deliberately avoided because
  its prerequisite regenerates the pre-existing learning artifact.
- `python3 -B -m unittest discover -s python/tests -p 'test_parser_lab*.py'`:
  105 passed on final runtime, including real dictionary preparation, default
  search budgets and the `moropotara` possession contrast.
- `python3 -B -m unittest python.tests.test_lexical_planner
  python.tests.test_semantic_context -v`: 24 passed. Nested different inner
  meanings with identical outer meanings survive portable source reload and
  reuse; repeated identical expressions reuse one declaration.
- `node --test electron/tests/providers.test.cjs
  electron/tests/agent-runner.test.cjs electron/tests/analysis-input.test.cjs`:
  77 passed. Provider transports are simulated; no live generation occurred.
- `npx vitest run src/domain/parser-lab.test.ts
  src/domain/expression-tree.test.ts src/domain/runtime-tree.test.ts`:
  33 passed on final UI.
- Focused Playwright through `/private/tmp/pydicate-parser-lab-ui.config.ts`
  (fresh Vite5179): three scenarios passed across focused runs: direct/decomposed
  suggestions and adoption (including a larger phrase with nested-only links),
  actual-engine selected-node meaning inspection, and composite definition/undo.
- Full lexical publication suite initially passed 12/17. Four `STALE_ENGINE`
  errors came from editing fingerprinted runtime code during the run; all four
  passed on stable targeted reruns (derived hypothetical case 30.7s; stative and
  two recovery cases 43.3s combined). The remaining old hard-coded compound-name
  and newly-added-base assertions were updated to follow the collision-safe
  reviewed name and inspect the existing shared base. That complete meaning-edit
  lifecycle passed in 27.1s. All 17 cases passed across these stable runs.
- Adjacent operation/partial/manual/pending suites: 39 passed; the previously
  recorded unknown-word publication-preview expectation still disagrees with
  the deliberate publication regression blocker. No change made to that test.
- Focused formatting and `git diff --check` pass.

## What worked

The selected engine gives `poropotar` for `(potar * moro).var(1)` and
`moropotara` for `(potar * moro).var(1).base_nominal()`. The suggestion attaches
the complete exact Navarro `poropotara` sense to the latter with `studio_define`,
while retaining `potar` and `moro` meanings below it. Every proposed dictionary
wrapper is revalidated and consumes the assembly budget. Accents are preserved
for dictionary-to-derived lexical linking; distinct homonymous senses survive.

Source-derived semantic context survives nominalization that replaces the
engine object. Explicit composite meanings are distinguished from inherited
`.definition` fields. Verified aliases expand with provenance; helpers, cycles,
rebinding, indirect meaning mutation and size limits produce explicit gaps.
Canonical publication identity prevents two different inner senses from being
replaced by the same outer alias. The inspector exposes selected scopes and
provider constituent requests bind to trusted source spans rather than client IDs.

## What failed and was corrected

- The original morphology search stopped at direct dictionary matches and
  omitted the relevant bound-object nominal construction families.
- Nominal annotations alone collapsed opaque lexical atoms and deeper trees;
  equivalence now preserves scoped structure while retaining neutral variant
  spellings as alternatives.
- Matching only runtime shape/root gloss caused different nested meanings to
  collapse during publication. Source scope identity fixes this independently
  of engine morphology equivalence.
- Source declarations can become stale after later dependency/alias mutations;
  such histories are omitted explicitly instead of assigning a later meaning
  to an earlier copied tree.
- An existing compound lifecycle test assumed `nhemoabare` was unoccupied.
  The real corpus already defines it with a different full gloss. The test now
  follows the generated collision-safe name and checks that base meanings stay
  unchanged through composite meaning updates.
- Copying collapsed `<details>` from the suggestion UI can yield empty-looking
  code/morpheme sections. Browser inspection confirmed their contents render
  when opened; this was not a missing-response bug.

## Remaining questions

- Surface equality is not etymology or paradigm equality: the derived noun
  gives `xe moropotara`, the direct dictionary noun `xe poropotara`. The UI and
  prompt instructions preserve the hypothesis distinction; no grammar patch
  was justified by this one form.
- Standalone Pydicate `semantic()` and `translation_prompt()` remain unchanged.
  Studio supplies the source-owned meaning hierarchy to its own prompt paths.
  Further grammar/API work should preserve copying, conversion and saved-source
  compatibility, with explicit paradigmatic/linguistic tests.
- The search remains bounded to declared families; broader historical accuracy,
  unrestricted deeper etymologies and live model interpretation are unmeasured.
- Short canvas overviews may collapse deep leaves; **Expandir tudo → Ajustar**
  reveals them. Existing camera behavior is preserved.

## Suggested next prompt

Restart Studio, rebuild the suggestion index and compare the direct and deeper
`moropotara` readings. Inspect `potar`, `moro` and the whole-node meaning; decide
which historical derivation and possessed paradigm the passage supports before
approving source/ground truth. If standalone Pydicate consumers need the same
nested semantics, port the scoped contract with copy/conversion regressions.

Selected engine remains clean at `09e06b37609f70045160885ac265e7a3997eee2c`;
corpus HEAD is `d72cb771117955454b16c3569de4415a2a6c4a70` with its existing local
contributor changes. No commit or push was made.
