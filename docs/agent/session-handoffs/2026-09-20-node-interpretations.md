# Every-node notes and scoped lexical meanings

## Goal

Show every rendered source-tree node in Léxico, allow semantic/grammatical notes
for the exact occurrence or reusable construction, and let contributors change
actual meanings locally or generally. Preserve both `obaîxûara` senses and carry
the chosen meaning and node notes into translation/analysis prompts.

## Files inspected

Required agent docs, existing lexicon/semantic/publication contracts, source AST
and canvas projection, active inventory, notebook persistence, provider and
analysis capture/resume, scratch/repair contexts, editor/App wiring and relevant
Python, desktop, domain and browser tests. Read actual neighboring engine/corpus
sources for evidence; no neighboring files were edited.

## Files changed

- `python/active_lexicon.py`, `authoring_runtime.py`, inventory tests: preorder
  source-node occurrences, forms/hierarchy, exact meanings, inherited meanings,
  stable note identities and explicit expansion/editability boundaries.
- New `python/node_definitions.py` and its tests; `authoring_service.py`,
  `adapter.py`, desktop worker/service allowlists: fresh exact-node definition
  overrides/removal, pending contexts, grammar-preserving general previews,
  comment preservation and active declaration targeting.
- `python/lexical_publication.py`: preserve occurrence comments beside promoted
  references in the passage and keep them out of newly generated shared entries.
  The definition test covers this through preview, apply and fresh reopen.
- `src/components/PassageLexicon.tsx`, `src/domain/passage-lexicon.ts` and tests,
  stylesheet and lexical browser harness/spec: every-node list, local/general
  meaning editor, inherited definition, stable/legacy notes and scoped actions.
- New `src/domain/lexical-note-sync.ts` and tests; `AssistantPanel.tsx`,
  `AnalysisSupport.tsx`, `App.tsx`: drain pending notes before AI capture,
  preserve failed detached writes, serialize remounted note versions, invalidate
  previews and prevent stale translation adoption.
- New `src/domain/analysis-submission.ts` and tests; analysis browser harness/spec:
  saved note-version identity in submission deduplication, including batches and
  explicit repair submissions. `tests/grammar-repair.spec.ts` covers changed-note
  dialog retries.
- New `electron/interpretation-context.cjs` and tests; notebook, provider,
  next-service, analysis input/service, agent-runner, scratch and grammar-repair
  services/tests: scoped frozen interpretations, precedence/provenance,
  reconstruction withholding and adoption guards.
- `electron/tests/translation-context.test.cjs`: real desktop/Python sense,
  note attachment, full/constituent prompt and protected-file regression.
- Agent current state/log/repository map/open questions, contributor guide,
  provider design and new `docs/design/node-interpretations.md`.

## Commands run and results

- `npm run typecheck && npx vite build`: passed; existing large-chunk advisory
  remains. Deliberately avoided rebuilding generated learning data.
- `npx vitest run src/domain/lexical-note-sync.test.ts
  src/domain/passage-lexicon.test.ts src/domain/analysis-submission.test.ts
  src/domain/ai.test.ts`: **21 passed**.
- `node --test electron/tests/interpretation-context.test.cjs
  electron/tests/lexical-notes.test.cjs electron/tests/analysis-input.test.cjs
  electron/tests/providers.test.cjs electron/tests/scratch-service.test.cjs
  electron/tests/agent-runner.test.cjs`: **107 passed**.
- `node --test electron/tests/grammar-repair.test.cjs
  electron/tests/analysis-service.test.cjs`: **32 passed**, including frozen
  private notebook restart/resume and explicit repair context. Temporary local
  Unix socket tests used approved escalation; no live provider calls.
- `node --test electron/tests/translation-context.test.cjs`: **1 passed** using
  the actual desktop service and Python engine, without inference. Real source,
  lexicon and reference bytes were checked unchanged.
- `python3 -B -m unittest python.tests.test_active_lexicon
  python.tests.test_semantic_context -v`: **26 passed** on the final Python code.
- `python3 -B -m unittest python.tests.test_node_definitions
  python.tests.test_lexical_publication`: **29 passed** (12 definition tests and
  17 existing publisher regressions), 353.085 seconds. The repeated full-corpus
  comparisons use disposable copies. Total final Python coverage: **55 tests**.
- Focused Playwright run using `/private/tmp/pydicate-parser-lab-ui.config.ts`,
  `tests/{passage-lexicon,providers-progress,translation-workflow,analysis-workspace}.spec.ts`:
  **22 passed**. Included all ten lexical cases, five provider/translation cases,
  both translation workflows and five analysis submission/launch cases. Used
  fresh Vite5179 with simulated transport; server stopped automatically.
- Focused `tests/grammar-repair.spec.ts` run with the same config: **2 passed**,
  including ordinary failure/retry and retry after changing only lexical notes.
  This adds two independent cases to the 22-case browser run.
- Scoped Prettier, `git diff --check` and generated-file diff check passed.
  Existing `src/generated/learning.json` remains 24 additions/8 deletions.
- Inspected the actual 812px App panel screenshots at
  `/private/tmp/pydicate-lexicon-{definition,general}-panel.png`: controls fit,
  scope choices remain distinct, lower notes use normal pane scrolling. Capture
  made no definition/publication writes.

## What worked

Root, intermediate constructions and repeated leaves have distinct occurrences.
Exact local overrides preserve morphology and shared definitions, survive source
publication/reopen in a disposable corpus, and retain constituent meanings.
General edits retain constructor grammar and open a concrete reviewed diff.
Stable note identities survive unrelated sibling edits and local wrappers; legacy
notes remain readable and their history is preserved when edited.

Actual-engine `obaîxûara` tests retain “mão de pilão” as inherited provenance while
“oposto, contrário” becomes the selected occurrence's effective meaning. Another
occurrence keeps its original sense. Scoped prompts include only corresponding
notes; unrelated notebook text and full private history stay out of model input.
No generated translation was used as evidence of linguistic correctness.

## What failed and was corrected

The real desktop integration first exposed a missing Python-worker RPC allowlist
entry, then a missing original sense when repeated inline nouns shared a general
construction ID. Both were fixed and the actual path now passes.

Independent review found positional-only wrapper replacement, dropped comments,
and general edits targeting an older superseded declaration. Keyword binding,
token-preserving edits and active declaration selection correct those cases.
Publication now retains the comments too; removing a wrapper keeps them inside
the operand grouping without triggering the initial-list metadata ambiguity guard.

Pending notes could be lost from capture after unmount/save failure or edits
during a held save. The registry now retains failed detached saves, shares
in-flight note state across remounts and drains latest fields. Browser tests
verify sequential versions/history and prompt blocking/recovery. Related fixes
preserve flush-error visibility, reject note changes during asynchronous
translation adoption and include saved-note identity in new-job deduplication.

## Remaining questions and limits

The inventory follows the visible source tree, not arbitrary internal engine
copies. Expanded declaration internals require an explicit visible expansion for
local source editing. Helpers without exact evidence remain candidates. A changed
subtree identity does not heuristically acquire another node's notes. Notebook
data remains local with export/history; reviewed source definitions are portable.

New requests capture current saved notes; resumed jobs intentionally retain their
original frozen snapshot. Context limits and missing evidence are explicit. The
neighboring engine's standalone prompt API is unchanged. Live linguistic output
quality was not measured. No real corpus, grammar, profile or reference edits,
project commit/push, generated-file regeneration or paid generation occurred.

## Suggested next prompt

Restart Studio, select `obaîxûara` in Léxico, use **Editar significado → Nesta
ocorrência** to assign “oposto, contrário”, add any grammar note at the relevant
construction and generate a current-tree translation prompt. Inspect the scoped
meaning and retained constituent definitions before requesting translation.
