# Inline morpheme highlighting — 2026-09-24

## Goal
Make selected-node contributions visible in existing ancestor result boxes, remove
extra tracing UI, and repair the user's actual Araújo60 failure.

## Inspected
Required agent docs, prior morpheme contract/handoff, canvas/preview layout,
`useMorphemeTrace`, morpheme domain/display code, backend evidence generation,
existing morphology/domain/browser tests. Read-only selected-engine Araújo source
and bounded AST evaluations; contributor modules were not imported/executed.

## Changed
- `python/authoring_runtime.py`, `python/tests/test_morphology_evidence.py`: preserve
  raw annotations and provide exact UTF-16 morphology segments in plain output.
  Only whitespace differences are tolerated; changed letters remain unavailable.
- `src/domain/authoring.ts`: optional typed morphology segments.
- `src/domain/morpheme-trace.ts`, `.test.ts`: consume exact spans, retain legacy
  annotation spacing support, align contextual roots/person-role morphemes and
  reserve sibling occurrences; equally supported conflicts remain unstyled.
- `src/components/ExpressionCanvas.tsx`, `useMorphemeTrace.ts`,
  `src/expression-canvas.css`: automatic selection styling, no toggle/summary/
  duplicate output, no result-box border changes. Existing text/layout preserved.
- `tests/canvas.spec.ts`: automatic selection, operation deltas, stale response,
  unchanged source/history and exact reported sentence through every ancestor.
- Contributor guide, morpheme design, agent current state/map/questions/log and
  this handoff. All earlier uncommitted work preserved.

## Diagnosis and outcome
Plain eval renders `i îeupiragûera`; annotated eval has
`i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]...` without the space. Previously this
rejected all morphology at the step. Ordered non-whitespace mapping now places
segments onto exact displayed text without modifying it. Actual Araújo60 highlights
`ybakype`, `i`, `îeupiragûera` in the selected reference and each ancestor, and can
switch to `rightsidegod` without re-evaluating selection or editing the expression.
Contextual `xererobîar` -> `arobîar` is covered at the sentence root as well.

## Commands / checks
- `python3 -B -m unittest python.tests.test_morphology_evidence -v`: 12 passed.
- `npx vitest run src/domain/morpheme-trace.test.ts src/domain/morpheme-display.test.ts src/domain/expression-tree.test.ts`: 36 passed.
- `npm run typecheck`: passed.
- `npx vite build`: passed, ordinary bundle-size advisory only.
- Focused Playwright `tests/canvas.spec.ts` using isolated
  `/private/tmp/pydicate-multipage.config.ts`: automatic constituent, negation,
  variant, stale response and actual Araújo60 scenarios: **5 passed** (15.8s).
- Screenshot inspected: `/private/tmp/pydicate-araujo60-automatic-highlights.png`;
  existing SVG boxes highlight correctly with no added UI.
- Prettier on changed TS/CSS; `git diff --check`.

## Read-only evidence survey
104 Araújo passages / 1,405 successful stages; 1,401 yield usable annotation spans.
Four actual letter disagreements remain (passages18,20,28,58), intentionally not
aligned as spelling corrections. Corpus bytes unchanged. Passage60 warm median
plain realization23.50ms versus morphology25.92ms (5 samples, namespace excluded).
These figures concern usable evidence, not certified linguistic attribution.

## What failed
The first Araújo60 browser run passed visual/ancestor assertions but failed a
brittle expectation of exactly one initial evidence request: harness hydration
issued two before settling. The assertion now measures request count before and
after selection, testing the actual reuse contract.

## Remaining questions / next prompt
Engine-native per-character ownership is not available. Genuine letter mismatches,
indistinguishable sibling occurrences and incomplete stages remain unstyled;
existing label truncation remains. Suggested next prompt: identify a concrete
operation whose contribution still needs better attribution, with its expression.
No neighboring repository writes, commits, provider calls or editorial approval.
