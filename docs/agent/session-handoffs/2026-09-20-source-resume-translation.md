# Multiline source, resumable AI and direct translation

## Goal

Publish and read multiline scholarly text such as `Nã e'i`; continue interrupted
AI work; translate the current tree into a chosen language without requesting a
new analysis. Improve translation context, review and adoption while preserving
the earlier Navarro, hypothetical-root and scoped-meaning work.

## Files inspected

- Required agent index, current state, repository map and open questions; prior
  authoring/provider/meaning handoffs and relevant source contracts.
- Python source annotation, publication, reference approval, runtime context and
  native corpus loaders; neighboring sources were inspected read-only.
- Desktop provider/context transport, durable analysis jobs, runner checkpoints,
  crash recovery, command replay and associated tests.
- Main result/translation views, assistant panel, analysis support, domain guards,
  source text fields and browser harnesses.

## Files changed

- `python/{studio_authoring,authoring_service,authoring_runtime}.py`,
  `python/tests/test_authoring.py`, new `python/tests/test_source_text.py`:
  marked source-text codec, exact source metadata during explicit reference
  approval, target agreement and byte-preserving neighboring records.
- `electron/{analysis-service,agent-runner}.cjs` and their tests plus
  `analysis-crash.test.cjs`: durable continuation, fresh attempt budgets,
  checkpoint/tool-receipt repair, budget pause and partial-text recovery.
- `electron/provider-service.cjs`, `electron/tests/providers.test.cjs`, new
  `electron/tests/translation-context.test.cjs`: dedicated translation prompt,
  local preview, language validation, fresh scoped evaluation, nested meanings,
  stale-engine adoption guard and actual Python-context integration.
- `src/App.tsx`, `components/{AssistantPanel,AnalysisSupport,SourcePane}.tsx`,
  `domain/{ai,analysis}.ts` and tests, assistant/support CSS: direct translator,
  language, local prompt preview/copy, reviewed adoption, preserved human text
  and visible same-conversation resume.
- Provider/translation/workspace browser scenarios and harnesses; publication
  selector follows the language-neutral translation field label.
- Agent current state, log, repository map, open questions, provider design,
  new `docs/design/source-text.md` and this handoff.

Earlier changes remain uncommitted. The pre-existing generated learning diff
(24 insertions/8 deletions) was preserved. No real source, lexicon, reference,
neighboring repository or live provider was mutated; publication tests use
disposable copies. No commit or push.

## Commands run and results

- `npm run typecheck && npx vite build`: passed. Existing large-chunk advisory;
  avoided `npm run build`, which would regenerate the learning artifact.
- `node --test electron/tests/agent-runner.test.cjs
  electron/tests/analysis-service.test.cjs electron/tests/analysis-input.test.cjs
  electron/tests/analysis-crash.test.cjs electron/tests/analysis-external.test.cjs
  electron/tests/providers.test.cjs
  electron/tests/pending-assistant-context.test.cjs
  electron/tests/translation-context.test.cjs`: **118 passed**. Local socket
  permission was approved; providers are simulated.
- `npx vitest run src/domain/ai.test.ts src/domain/analysis.test.ts`:
  **13 passed**.
- `npx playwright test --config /private/tmp/pydicate-parser-lab-ui.config.ts
  tests/providers-progress.spec.ts tests/translation-workflow.spec.ts
  tests/analysis-workspace.spec.ts --grep 'quick|current tree translation|paused
  analysis|AI UI distinguishes|Translation defaults|Partial translation|human
  translation is editable|using a proposal and translation'`: **9 passed**
  against fresh Vite5179, including the full-app launcher. The grep is one
  continuous argument. Fixtures do not call a provider.
- Focused Python source/approval checks passed across stable runs. The final
  Unicode-separator check ran `python3 -B -m unittest
  python.tests.test_source_text
  python.tests.test_authoring.CorpusCopyTests.test_reference_approval_carries_exact_source_text_and_rejects_source_target_mismatch
  python.tests.test_authoring.CorpusCopyTests.test_explicit_authoritative_approval_writes_only_next_reference`:
  **6 passed**. Earlier create/edit/reopen/clear/legacy/approval cases also passed.
- Scoped Prettier checks for the changed desktop/UI/tests and
  `git diff --check`: passed.
- Visual inspection at 1600×1200 with the actual 400px support pane: language,
  translation, alternatives, review/copy and resume fit without clipping. Images
  are `/private/tmp/pydicate-{translation,resume}-{panel,desktop}.png`.
  The temporary server was stopped.

## What worked

Source text uses JSON-string encoding only when needed, with a content-bound
`studio:v1` marker. Newlines, CRLF, blank lines, significant whitespace, quotes,
literal escapes and directive-looking content round-trip without executing
contributor code. Unmarked or altered legacy values remain literal. Approval
copies explicit scholarly source fields only into the approved record, checks
the reviewed target and preserves every other JSONL row and blank line. Unicode
line separators are escaped in both source comments and JSONL framing.

`analysis_resume` keeps the same job, saved input, conversation, questions,
candidates and checkpoint; optional user instructions become a turn. Each
explicit continuation gets fresh budgets. Confirmed tool results are reused;
unknown interrupted tool effects are reported without replaying a write.
Duplicate commands are idempotent, and changed source/engine evidence rejects
continuation. Partial text survives an owner crash and old attempt streams do
not appear as new output.

Translation uses the existing tree with a fresh local evaluation. Full passage
is the default even when a node is selected. Explicit constituent requests get
their own isolated evaluation and separately labeled passage context. Preview
and inference share the same prompt and hash; preview needs no provider.
The prompt distinguishes base and composite meanings, final grammatical roles,
literal readings, lexicalized meanings and uncertainty. Prior human translation
is omitted from the model input and retained until explicit reviewed adoption.
Translation results cannot replace the expression or overwrite a newer draft
or a draft evaluated with a changed engine.

The real desktop-to-Python integration verifies `moropotara` component/whole
meanings and selected `potar` scope with no inference. Source, lexicon and
reference bytes remain unchanged.

## What failed and was corrected

- A source-test run overlapped edits to fingerprinted runtime code and rejected
  stale evidence. Stable targeted reruns passed.
- An old approval test assumed an unapproved trailing passage; today's corpus
  is fully approved. The fixture now removes the final reference only in its
  disposable copy.
- Native JSONL loading splits Unicode line separators. A failing regression
  established that exact text must be escaped in the serialized record; the
  corrected file loads in a fresh native process.
- Review found whole-passage output mislabeled as a selected constituent's
  evaluation and missing grammar-version validation during translation adoption.
  Both were fixed and covered by focused and combined tests.
- The visual harness has an unrelated relative-logo URL under `/tests`; no
  product layout defect was found.

## Remaining questions and limits

- Independent native `oldtupicorpus` source readers do not yet decode Studio's
  marked comment extension. Studio import, publish, exported-source reopen and
  approval do. Port the explicit codec upstream if native source consumers need
  original multiline values; never decode every legacy literal `\\n`.
- Native reference readers retain their existing outer-whitespace normalization;
  exact text is present in the serialized JSON fields.
- No live AI generation was performed. Transport/checkpoint/UI tests cannot
  establish translation quality, provider billing behavior or live continuation
  reliability. Interrupted inference is not claimed to be exactly-once.
- Restart the desktop main process to load service changes. Changed project
  evidence can require a fresh analysis submission rather than continuation.

## Suggested next prompt

Restart Studio, publish/reopen the multiline `Nã e'i` draft, resume an eligible
paused conversation, and use **Traduzir** beside the result to inspect the local
prompt in the desired language. If native corpus scripts also consume these
comments, extend their source parser with the marked codec and compatibility
tests before relying on native multiline metadata.

Read-only verification found clean sibling checkouts: engine
`ad3bc0ba90b80df14bd2fd3fe5a0c45d5e0451b2`, corpus
`84f5b0d67ee653dcd70e2fd23c290d716268e474`. Runtime operations also bind to
content fingerprints; these current revisions supersede yesterday's handoff.
