# Navarro vocabulary and productive morphology

## Goal

Make **Sugerir** recognize vocabulary beyond the small declared training
inventory, including the reported `tekate'yma`; reuse Navarro/Pydicate data,
recover less obvious roots and support syntax with explicitly unknown roots or
proper names without inventing definitions.

## Files inspected

- Required agent index/current state/repo map/open questions and parser-lab
  implementation handoff/design contract.
- `python/parser_lab/`: engine, index, grammar, datasets, jobs, search, worker,
  contracts, equivalence, feedback, judgments, ranker, evaluation, artifacts.
- Studio dictionary/runtime helpers: `python/navarro_search.py`,
  `python/authoring_runtime.py`; parser-lab Python/desktop/domain/browser tests,
  components, stylesheet, configs, package scripts and native smoke script.
- Read-only sibling sources: Pydicate predicate/bulk iterator, NavarroDB,
  noun/verb implementations, dictionary gzip data and corpus shared lexicon.

## Files changed

- New `python/parser_lab/lexicon.py`: exact-sense dictionary/shared snapshot,
  portable constructors, engine-derived aliases, coverage and content identities.
- New `python/parser_lab/morphology.py`: bounded request-local expansion,
  productive constructions, typed explicit lexical hypotheses and evidence.
- `python/parser_lab/{engine,index,jobs,grammar,search,contracts,worker}.py`:
  artifact integration, root expansion, fresh validation and partial status.
- `python/parser_lab/{equivalence,evaluation,feedback,judgments}.py`: preserve
  lexical senses and repeated homographs, finite annotation scan, held-out
  lexical aliases, provisional provenance and historical-evaluation exclusion.
- `electron/parser-lab-service.cjs` and its test: transport explicit root hints.
- `src/components/{PassageSolver,ParserLab,LabLexicalHints}.tsx`,
  `src/domain/parser-lab.ts`, `src/parser-lab.css`: hints, coverage, provenance,
  rebuild progress, truncation disclosure, compact code previews, stale-response
  and draft-editability guards.
- `python/tests/test_parser_lab.py`, new `test_parser_lab_lexicon.py` and
  `test_parser_lab_morphology.py`; domain and both parser-lab browser suites.
- `scripts/smoke-parser-lab.mjs`: choose the original ambiguous reading by source
  identity instead of assuming exactly two results after dictionary expansion.
- Agent current state/log/repo map/open questions, design contract and this handoff.

The pre-existing change to `src/generated/learning.json` was left alone. No
neighboring repository or generated corpus file was edited. No commit or push.

## Commands run and results

- `python3 -B -m unittest discover -s python/tests -p 'test_parser_lab*.py'`:
  **97 passed**, 21.607 seconds on the final run.
- `node --test electron/tests/parser-lab-service.test.cjs`: **10 passed**.
- `npx vitest run src/domain/parser-lab.test.ts`: **15 passed**.
- `npm run typecheck` and `npx vite build`: passed. Ran Vite directly so the
  existing generated learning file would not be regenerated. Vite reports its
  existing large-chunk advisory.
- Playwright `tests/parser-lab-shell.spec.ts tests/parser-lab.spec.ts` using
  `/private/tmp/pydicate-parser-lab-ui.config.ts`: **20 scenarios passed across
  the combined run and a focused final rerun**. The combined run passed 19;
  its sole failure assumed exactly two `sapépe` readings. The repaired test
  passes and verifies the actual expanded set, selected source/rank and judgment.
- Narrow Prettier checks, `node --check scripts/smoke-parser-lab.mjs` and
  `git diff --check`: passed.
- Actual desktop service → batch index build → persistent Python worker via
  `/private/tmp/pydicate-navarro-service-smoke.cjs`: **8 cases passed**, each
  best candidate replayed through the service's evaluation operation.
  Artifacts live in the temporary `studio-navarro-service-GQr1EW` profile.
  Build took 7.865 seconds while other checks ran; subsequent requests ranged
  from 0.032 to 1.143 seconds. No provider calls or real profile/corpus writes.

## What worked

The local snapshot has 8,293 Tupi dictionary senses; 7,066 supported senses
produce 7,071 exact constructor rows. Together with the shared lexicon the
verified service artifact contains 7,430 lexical rows. Another 1,227 senses are
reported skipped (1,204 unclassified headers, 23 unmatched exact verb senses).

`tekate'yma` is Navarro `ekate'yma`, with its `(t)` class realized as
`t[PLURIFORM_PREFIX:T:ABSOLUTE]ekate'ym[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN]`.
The same root works in possession, negation and locative forms. Engine-derived
anchors also recover `só → kûãî`, `ur → îori`, `angaîpaba → angaîpápe` and nominal
past `aíba → aígûera`. Dictionary-only postpositions now participate in syntax.

The real service returns complete results for `tekate'yma`, `tekate'ỹme`,
`xe rekate'yma`, `ekûãî` and `angaîpápe`; the last reports a truncated search.
`Araci osó` with a proper-name hint and `apiripok` with an intransitive-root hint
return provisional partial readings. `zzzz` remains unknown.

Hints preserve empty definitions, fail clearly if a known noun/verb would
silently inherit a dictionary class, and remain provisional after selection.
Dictionary meanings cannot collapse merely because their morphology agrees.

## What failed and was fixed

- Initial closed-inventory assertions expected one/two readings. Expanded
  dictionary senses are legitimate alternatives; tests now assert identity and
  uncertainty rather than erase extra readings.
- A literal `pe` filter missed its `me` allomorph. The bounded proposer now
  includes locative `pe` even when citation spelling is absent; the engine still
  validates the entire result.
- The initial bare-root pass exceeded the morphology-specific cap; it now
  observes the same cap and reports truncation.
- Noun paradigm probes exposed an infinite loop in the sibling annotation
  parser on leading/orphan tags. Interrupted those test processes and replaced
  only Studio's annotation scanning with finite extraction; duplicate tags,
  bare text and empty-surface tags are retained. No upstream patch was applied.
- The existing Vite server on 5173 served stale source, and sandboxed local
  binding initially failed. Browser checks used an approved fresh server on
  5179 and a temporary config; it was stopped after the checks.
- A first patch applying the documentation/native-smoke update failed because
  one context line differed; it was reapplied against the current text.

## Remaining questions and validation boundaries

No unrestricted historical recognition or OCR/spelling conversion is claimed.
Templates and chart composition remain bounded; automatic inference of entirely
unknown roots is not implemented, so missing vocabulary needs an explicit hint.
Unsupported dictionary classes are visible coverage gaps. Editorial approval
and source publication remain separate actions.

The complete repository suite and full native Electron smoke were not rerun;
the native script's changed selector received syntax checking and analogous
real-engine browser coverage. The actual service smoke ran real local engines,
while shell UI scenarios use their documented mocks. Existing user profile
activation was not changed: restart Studio and use **Repreparar índice**.

## Suggested next prompt

Collect a small contributor-reviewed historical set containing failures from
real use, record expected roots and constructions, and use coverage diagnostics
to prioritize additional families, dictionary classifications and explicit
historical spelling alternatives without turning hypotheses into approval.
