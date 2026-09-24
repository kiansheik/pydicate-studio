# Experimental coordinated morpheme highlighting

## Goal

Add an initially-off development toggle that follows the selected constituent's
surface contribution through ancestor results to the root. Selecting a unary
operation or variant should highlight its added/changed surface, rather than the
whole input inherited from its operand.

## Files inspected

Required agent index/current-state/repo-map/open-questions; source graph projection,
canvas rendering/layout and previews; runtime step snapshots, bounded interpreter,
evaluation service and source provenance; current engine annotations through
read-only probes; real-engine browser canvas harness and focused domain tests.

## Files changed

- `python/authoring_runtime.py`, `authoring_service.py`: optional `includeMorphology`
  evaluation evidence, independently isolated annotated step snapshots, diagnostics
  for annotation failures or exact-surface mismatches, successful partial branches.
- `src/domain/authoring.ts`: optional annotated/diagnostic successful-step fields.
- New `src/domain/morpheme-trace.ts`: bounded ordered token alignment, conservative
  ambiguity handling, cumulative propagation and operation deltas, UTF-16 ranges.
- New `src/components/useMorphemeTrace.ts`: toggle-only engine request and guarded
  cache, selection-local recomputation, late-response rejection.
- `ExpressionCanvas.tsx`, `expression-canvas.css`, new `MorphemeHighlight.tsx` and
  `morpheme-display.ts`: toggle, full-result strip, synchronized ancestor boxes,
  wrapped/truncated exact display mapping and accessible contrasting highlights.
- New morphology-evidence, trace-domain and display-domain tests; real-engine
  canvas browser harness forwards opt-in and tests actual selection behavior.
- Agent state/log/map/open questions, contributor guide, morpheme-tracing design
  and this handoff. Existing formatter/PDF edits remain intact.

## Commands and results

- `python3 -B -m unittest python.tests.test_morphology_evidence -v`: 8 passed.
- `npx vitest run src/domain/morpheme-trace.test.ts src/domain/morpheme-display.test.ts src/domain/expression-tree.test.ts`: 33 passed (18 trace, 3 display, 12 source graph).
- `npx playwright test --config /private/tmp/pydicate-multipage.config.ts tests/canvas.spec.ts --grep 'experimental morpheme tracing|selecting negation highlights|morpheme tracing clears|variant highlighting follows'`: 4 passed.
- `npm run typecheck`, `npx vite build`, `git diff --check`: passed. Existing Vite
  large-chunk advisory remains. Generated learning data was not rebuilt.
- Inspected browser screenshots of full-result highlighting and a variant trace
  through three ancestor boxes. Fixtures use the real local engine read-only.

## What worked

`tym` traces through `emi * tym` and `og * (emi * tym)`; selecting `emi` updates
highlights without another engine request. Negation highlights only its n/i
morphemes. A silent variant highlights nothing and explains why. `îe.var(1)` marks
only `nh` in `nhe`, then carries it into `onhetym` and `onhetyma` without marking
unchanged `e`. Delayed responses cannot restore highlights from an older draft.
No source/draft/history/approval changes occur; default evaluation has no added
annotation work. Loose pieces remain scoped to their own tree.

## Failures / evidence limits

An initial browser assertion counted implicit status on HTML output as a loading
indicator; corrected it to target the loading text. All four focused cases pass.
The initial trace-domain run caught token metadata leaking into range objects;
only start/end fields are returned now.

The backend agent's broader partial-evaluation suite had 11 passes and one existing
expectation failure: unknown-reference source preview is blocked by publication
regression. Reproduced with HEAD runtime/service in a temporary copy; no unrelated
behavior or assertion was changed.

Read-only corpus probe: 104 complete passages, 1,405 successful step previews,
1,362 with exactly matching tagged/plain surfaces. The other 43 remain explicit
diagnostics (many whitespace differences; some actual spelling differences).
This is experimental alignment, not authoritative causal engine provenance.
Ambiguous repeats, unavailable stages and unsupported allomorph correspondence
stop that portion of the highlight. Shared-reference internal runtime viewer nodes
need explicit copied source operations to participate in this canvas feature.

No neighboring repository edits, corpus writes, provider inference, generated
artifacts, commits or pushes were made.

## Remaining questions

Native per-morpheme source provenance would be needed to cover the currently
ambiguous allomorph/zero-form cases authoritatively. Future handling of annotation
whitespace disagreements would need an explicit exact-offset map, not normalization
that silently changes the displayed form.

## Suggested next prompt

Restart Studio and enable **Rastrear morfemas · experimental** in a working tree.
Try a root, a negation and a variant; report a specific expression whose expected
contribution is not traced so its annotation/alignment case can be investigated.
