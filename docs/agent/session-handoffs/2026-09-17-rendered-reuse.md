# Reuse by rendered Tupi

## Goal

Let contributors find and insert predicates and previously authored structures by typing their rendered Tupi form without memorizing variables. Ignore spaces, include unnamed subexpressions and current drafts, cache the cumulative material, and preserve source-faithful operations and human choice.

## Files inspected

Required agent guide/state/map/questions; current runtime/interpreter, lexical catalog, project fingerprints, source parser and exact spans; draft hook and persistence contracts; Electron RPC routing/limits; all lexical insertion components and tree source/scope behavior; prior native/browser harnesses. Read-only corpus/engine inspection verified source expressions versus saved rendered references and local lexical namespaces. Memory's source-versus-ground-truth distinction was verified against current code.

## Files changed

- New `python/rendered_structures.py` and `python/tests/test_rendered_structures.py`; runtime/service routes and adapter implementation fingerprint.
- New `src/components/LexicalInput.tsx`, `src/lexical-input.css`, `src/domain/structure-drafts.ts` and tests. Shared invocation/context registration in `authoring.ts` and `useStudio.ts`.
- `AuthoringEditor.tsx`, `TreeScopeEditor.tsx`, `RuntimeTree.tsx`, `NewPassageDialog.tsx`: shared picker, scope/revision guards, pending destination and separate natural query/code values.
- Electron next-service/worker allowlists and worker routing regression.
- New `tests/rendered-lookup.spec.ts`; explicit-code changes in `expression-tree.spec.ts`; optional new-passage/global-lexicon fixtures in `next-hook-harness.tsx`.
- README, [design contract](../../design/rendered-reuse.md), agent state/map/questions/log and this handoff.

Earlier dirty work was preserved. No source/reference regeneration, neighboring edits, commit or push.

## Implementation

The index records successful source AST stages, named lexical predicates, verified lexical declaration interiors, and changed contextual drafts. Unicode/case/whitespace/apostrophe normalization preserves exact diacritics; approximate matches are labelled, and recognized portions of a longer reading rank by useful length. Structural variants with the same spelling remain separate; equivalent repeated occurrences retain provenance.

Search uses a rebuildable source cache keyed to project/corpus/engine/adapter fingerprints, plus a draft-content cache. Actual code edits invalidate draft results; revision-only changes need no rebuild. Request-time draft injection includes edits not yet persisted, excludes unassociated/conflicted namespaces and omits human notes/readings. New-passage lookup uses Araújo's append context. Selection revalidates source and destination realization/structural fingerprints; a changed alias can become an expanded copy only after both contexts agree. Malformed caches are discarded, and stale selections fail explicitly.

Search text never becomes executable code. Contributors choose a verified candidate, then use the existing selected-scope replacement/argument action. Suggestions show surface, source and lexical note, with partial/relaxed match labels. All insertion sites use the same component, including the global Léxico's primary reuse entry; named definition inspection remains separately expandable. Keyboard navigation, cancellation of stale results, loading/errors, direct code entry and categorical usage logging are included.

## Commands run / what worked

- `npm run build`, TypeScript, focused Prettier and `git diff --check`: pass. Existing bundle-size advisory remains.
- `npx vitest run src/domain/structure-drafts.test.ts`: 2 pass. `node --test electron/tests/python-worker-authoring.test.cjs`: 1 pass.
- Rendered-structure Python suite: 11 pass, including normalization, homographs, segments, future redefinitions, helper state isolation, actual unnamed Araújo81 reuse into passage1, current drafts/stale selection, conflicting same-surface aliases, cache/restart, and independent realization/shape comparison of every indexed candidate.
- Existing lexical runtime-context regression and six step-evaluation tests: 7 pass, including independent parity across all 82 Araújo final forms/annotations/structures.
- `npx playwright test tests/rendered-lookup.spec.ts`: the initial 9 scenarios pass; the subsequent global-catalog scenario also passes. Existing expression-tree/runtime-tree/authoring-sync/ground-truth tests: 37 pass. Total 47 distinct relevant browser scenarios. The pending-passage test was rerun after its final revision guard and passes.
- `/tmp/pydicate-rendered-reuse-native.mjs`: production Electron with a temporary profile and actual local grammar. Spaced `o emi tym bûer ypy` finds the unnamed compound; selection inserts `(pûera * (og * (emi * tym))) / ypy` with all nine source nodes. Undo restores the full original passage. A synthetic draft-only predicate appears when searching from another passage and after restart. Original source, lexicon and reference SHA-256 values remain unchanged; zero page errors.
- Final native artifacts: `/tmp/pydicate-rendered-native-CtSTsp/` (report, suggestions and reused-tree screenshots, inspected). Earlier equivalent run: `/tmp/pydicate-rendered-native-14gX1h/`. Cold desktop search ~5 seconds including UI/IPC/index construction; draft search ~1.7 seconds and restart search ~1.4 seconds. Direct backend cold index ~3.6 seconds, warm search ~0.135 seconds; 1,188 distinct structures.

All provider checks for this task are absent; no AI generation or authentication calls were needed.

## What failed and was corrected

The first index implementation took ~18 seconds; shared namespace/declaration processing reduced cold construction to ~4 seconds. Canonical object-copy topology initially differed between some indexed named values and actual reference interpretation, producing false structural variants; using the same copied-occurrence interpretation fixed all candidates, confirmed by a complete index reproduction probe. A transient build during parallel integration lacked the new picker prop; the completed shared component/reexport builds correctly. Native visual inspection found inherited button centering and narrow phrase inputs; final layout now left-aligns results and gives the natural argument field full width. Inherited expression definitions are labelled as lexical notes, not implied translations.

## Remaining questions

Two isolated stages in Araújo77 (`îe * mombeu` and its variant) need their parent `.base_nominal()`; the successful parent/children remain indexed and failed isolated stages are reported. Unsupported or contextless archived drafts cannot receive invented reusable forms. Partial phrase lookup does not compose a new sentence automatically. Large draft sets eventually need delta synchronization to exceed the current 1 MB IPC ceiling; current material is comfortably below it. User feedback should assess real-line authoring with the new natural lookup.

## Suggested next prompt

Build the next real line using rendered-Tupi lookup. Report any expected form that cannot be found, or a point where choosing and combining known portions takes too many steps. Preserve source-faithful operations, displayed intermediate results and exact undo while refining that workflow.
