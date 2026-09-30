# Definition reuse and passage navigation — 2026-09-30

## Goal

Keep recognizable shared-tree tabs open across passage changes; reuse newer
`enosem_26169d1f` from old `enosem`; resolve shared dependencies without making
authors manage source order. Add source/section/subsection accordions, startup at
the final listed passage and live draft/status updates. Expose second-class
stative conversion of roots/compounds through the ordinary tree operation menu.

## Files inspected

Required agent guides; tree workspace/editor, PieceSearch/LexicalInput, App/useStudio
and source review; Python lexical index, declaration evaluation/preview/publication
guards; existing focused fixtures and live QA. Read-only production search and an
isolated corpus/grammar snapshot checked the exact definitions and all saved lines.

## Files changed

- TreeWorkspace/RuntimeTree/CSS: tab borders/backgrounds, persistent editors,
  passage-only canvas replacement and retained origin context.
- SharedDefinitionReuse, SharedTreeEditor/CSS, shared-definition domain: complete
  lexical search, named reference/copy choices, undoable replacement, checked
  dependency disclosure and generation-guarded asynchronous search.
- App, grammar-diagnostic domain: origin-bound dialog/submission/notes;
  full project switch resets tabs, passage navigation preserves them.
- Python shared-definition resolver/service/runtime and focused tests: dependency
  graph, compatible serialization, exact AST coordinates, cycle/rebinding and
  mutation guards, shared-tree annotation review acknowledgement.
- SourcePreview domain, source-review content, App/useStudio: annotated before/after
  rows and explicit checkbox tied to preview identity; source_apply acknowledgement.
- PassageNavigator/CSS, passage-navigation domain/tests, useStudio/App: accordions,
  draft locator/status updates, latest selection including pending/admin order,
  search/filter expansion and small-screen reveal behavior.
- Rendered structure search/tests: exact name precedes surface substring matches.
  Browser shared-tree/navigation fixtures and agent documentation.
- Tree operations/terms/removal, runtime capability metadata and exact canvas-node
  matching: `v(…)` with the selected engine's nominal conversion where necessary.
  Domain, Python and actual-engine browser checks cover preservation and undo.

## Commands and results

- Focused browser checks passed for persistent camera/undo, 800×600 appearance,
  origin-bound grammar submission, reference/copy/undo and stale search responses.
  Final four reuse/race cases passed in15.4s on isolated port5181.
- Navigator: four domain, four browser and six Python search-ranking checks passed.
- TypeScript and final app build pass (existing large-chunk advisory only).
- 19 actual-engine shared-definition tests and seven publication-portability tests
  pass. Two browser checks cover annotation before/after, acknowledgement reset
  and submission of the exact reviewed preview.
- Two final focused shared-definition tests pass after the indirect alias-mutation
  guard; the exact production-snapshot preview still passes all153 lines/references
  with only the one explicitly reported annotation change and no source writes.
- Stative operation: 27 domain, four selected-engine Python and one actual-engine
  normal-mode browser preview/apply/undo check pass.
- `.local/vps-qa/stative-engine-proposal/generalized-v.patch`: five isolated engine
  tests pass; all153 saved outputs and annotations remain unchanged. The portable
  patch affects only `v()`, copied source provenance and a focused engine test.
  No neighboring or live engine file was modified before requesting permission.

## What worked and what failed

A passage-ID key remounted all tabs. Moving it to only the passage canvas preserves
definition editor state. Generic search actually returned the exact new name second;
surface substring ranking hid its priority, and passage-scoped resolution could
not evaluate it inside the older declaration context. Complete lexical lookup and
dependency resolution fix selection/evaluation without admitting passage shadows.

Closing/reopening replacement search exposed a stale-result race: the identity
string became equal again. Monotonic generations and snapshot clearing fix this.
Final review also found that mutation through an alias could change an imported
definition's meaning while preserving every surface and annotation. Resolved
imports now compare complete runtime shape and lexical status with the complete
saved lexical context before reuse; differences fail explicitly.
Concurrent Playwright runs shared Vite5173 and test-results, causing HMR/trace/
connection failures; final runs isolate ports and artifacts.

Production snapshot: old `enosem` line262; `sem` line558; `enosem_26169d1f` line565
with meaning metadata. Proposed `enosem_26169d1f.copy()` evaluates fully. All153
surfaces/reference comparisons remain unchanged. Only Araújo58 changes
`enosem[ROOT]` into `eno[CAUSATIVE_PREFIX:ERO]sem[ROOT]`. The strict annotation guard
blocked publication; the new path presents this and requires acknowledgement
instead of silently ignoring it.

Stative conversion changes the reported `otekokuaba'e` into `itekokuaba'e`,
retaining the compound and incorporation annotations. The current engine handles
nominals through `v()` and verbal compounds through `.base_nominal()` first.
Adverbs/interjections need the separately prepared engine extension. Native
nominalization errors remain errors. Live `bae * (-Verb("só"))` and its positive
counterpart both produce `osoba'e`, confirming the distinct negation bug; no
negation fix has been applied.

## Deployment and live verification

Pending. No live research mutation was made during implementation/snapshot checks.
Final preflight: live release `e5852d84`, running; host4.0GB free. The generalized
engine patch is awaiting the user's explicit exception to the neighboring-repo
restriction; Studio rollout remains independently authorized.

## Remaining questions

Ambiguous historical rebinding, helper side effects and source-local passage
execution retain conservative boundaries; this is not a general Python module
scheduler. Shared lexical definitions resolve by dependencies; serialized Python
remains compatible with current corpus tools. Draft/open-tab state is local to
the running browser/session. No real provider inference is needed for checks.

## Suggested next prompt

Exercise linked-definition review and section navigation on normal research work;
report unsupported graphs with their exact expression/source.
