# AI authoring critic round 1: linguistic and authoring integrity

Independent review of the uncommitted AI milestone on 2026-09-17. The initial
findings below are retained alongside the post-fix verification.
No inference request, publication, reference approval, or neighboring-repository
write was made. The real-engine probe used a temporary worker state directory.

## Findings requiring correction

1. **P1 — Araújo-only retrieval loses ordinary shared predicates.**
   `analysis-service.cjs` freezes `allowedSourceIds: [sourceId]`, while
   `authoring_service.py:521` rejects a merged structure if *any* occurrence has
   another source ID. Shared `lexicon` definitions are rejected; a permitted
   Araújo occurrence is also rejected if the same expression appears in
   Bettendorf. Actual selected-engine queries reproduced `santa_cruz` 1 → 0
   results, `pysyro` 22 → 8, and `Tupã` 88 → 45. The missing `santa_cruz` entry
   has both Araújo and Bettendorf occurrence records; the missing
   `ProperNoun("Tupã")` declaration has source ID `lexicon`.

   Fix: explicitly allow the shared lexicon; retain a candidate with a permitted
   occurrence and a permitted resolution context, and omit out-of-scope origins
   from returned evidence. Preserve the stricter “any excluded answer occurrence”
   behavior for reconstruction exclusions. Add real shared-predicate regression
   cases rather than simply widening the manifest to Bettendorf.

2. **P1 — Reconstruction redaction is not a single output boundary.**
   `scratch-service.cjs:490–499` clears only raw/canvas/selectedNode and some
   context. It leaves `evaluation.expression`, `feedback.candidate.raw`, and
   previous conversation text. A fixture carrying `HIDDEN_ANSWER` in these
   fields returned all three from `studio_context`. Independently,
   `agent-runner.cjs:213` serializes the original whole packet directly into the
   initial provider message, so even its raw answer bypasses tool-only redaction.

   Fix: share one permitted-input projection between context tools and provider
   dispatch, covering nested prior evaluation/candidate/feedback/history and
   continuation checkpoints. Regression tests should assert that an answer
   sentinel is absent from the actual provider message, not only absent from
   the context tool's top-level raw field. This applies to reconstruction
   evaluation; ordinary assisted reuse may retain its explicitly permitted
   current analysis.

3. **P2 — Legacy saved surfaces confer an unsupported context label on current
   expressions.** `analysis-service.cjs:502–547` selects any preceding passage
   with an `acceptedReference`, includes its current `sourceExpression`, and
   labels the pair `preserved-ground-truth`. But `adapter.py:362` explicitly
   warns that positional legacy references certify neither human approval nor
   correspondence with external edits. The source expression can have changed
   while its legacy saved surface remains. This risks feeding an unreviewed
   current analysis to the next job as reviewed context.

   Fix: preserve the original saved surface with its legacy provenance, omit
   unverified current expressions from default reviewed context, and make the
   lack of a bound expression approval explicit. Matching a current rendered
   string is not sufficient to invent a historical review decision.

4. **P2 — Removed dictionary senses remain presented as candidate evidence.**
   `scratch-service.cjs:665–767` copies the evidence bag across every edit; raw
   replacement does not qualify or invalidate it. Reproduced: insert exact
   Navarro `abá` fixture row 42, then replace the entire source with
   `Noun(value='unrelated')`; the candidate still carries the `abá` sense as its
   evidence. `AnalysisSupport.tsx` displays the whole bag under the current
   “Evidência e diferenças” without an active/historical distinction.

   Fix: retain the research history, but bind evidence to exact surviving
   expressions/nodes or explicitly mark it historical/unbound after editing.
   Do not imply that an earlier sense supports the replacement word.

## What the inspected implementation gets right

- The headless builder imports the contributor's TypeScript transforms instead
  of generating a second DSL. Exact raw and candidate revision guards cover
  detach/connect/duplicate, holes, loose pieces and inline scalar arguments.
- Evaluation returns the Python source AST as `tree` and the realized-object
  graph separately as `runtimeTree`. The AI candidate does not replace explicit
  Pydicate operations with a manufactured lexical `Classifier` node.
- Dictionary selection keeps the website gzip checksum and row index separate
  from a verified engine verb ID. Full definitions survive conversion, and
  nonverbal selections receive evidence records too.
- Proposed candidates are explicitly `hypothesis-for-human-review`; exact,
  spacing/case and accent-folded comparisons are distinct and preserve strings.
  Proposal and acceptance do not call publication or reference approval.
- MCP tool discovery excludes source application, shared lexicon writes,
  reference approval and generic worker dispatch. The existing bounded evaluator
  remains the engine boundary; raw source does not become arbitrary Python.

## Verification and concrete artifacts

- Read the supplied implementation prompt, agent documentation,
  `docs/design/ai-authoring-contract.md`, `docs/design/mcp-agent-guide.md`, the
  scratch/analysis/runner services, shared builder imports, relevant Python
  retrieval/adapter code, candidate review code, and the focused test suites.
- `node --test electron/tests/scratch-service.test.cjs`: **8 passed**.
- `python3 -B -m unittest python/tests/test_scoped_authoring.py -v`: **2 passed**.
- A read-only `PythonWorker` opened `/Users/kian/code` with temporary state and
  compared `structure_search` with and without the frozen Araújo source filter.
  The actual results are recorded in finding 1.
- A fixture-level scratch probe reproduced both the surviving stale dictionary
  evidence and nested reconstruction answer fields described above. Its imported
  scratch suite also finished **8 passed**.
- `docs/coverage/araujo.json` records **86 actual expressions**, 86/86 independent
  engine/surface/annotation/structure parity, and **0/86 matched per-expression
  native UI certificates**. It is useful engine evidence, not proof of every
  edit or linguistic interpretation. Corpus revision:
  `292a28722a1790abf3f3b93083c29fbd47b4ffd0`; grammar revision:
  `348686045bf0791c847be3cba1b15eaae7312a11`; both are dirty and the audit records
  their exact content fingerprints.

## Remaining verification boundaries

The reconstruction/assisted linguistic evaluation set and root's native Electron
vertical workflow were still being completed during this review. No live model
linguistic quality was tested, and the existing historical PDF/font limitation
cannot be resolved by a synthetic region fixture. A source-backed tree and
matching surface do not establish correct subject/object attribution. Recheck
the findings after implementation fixes, then conduct contributor and failure
critic rounds against the resulting artifacts.

## Post-fix verification

The four findings above were addressed and independently rechecked:

- Retrieval now records each merged origin's exact execution context, permits
  the shared lexicon, and returns only allowed occurrence evidence. Actual
  queries now find and resolve `santa_cruz` (**1 result**), `pysyro` (**22**) and
  `Tupã` (**88**). All returned origins in these probes belong to Araújo or its
  shared lexicon; Bettendorf origins are absent. Explicit reconstruction answer
  exclusions remain conservative.
- `electron/analysis-input.cjs` supplies the same projection to context tools
  and provider dispatch. The provider sentinel regression covers nested
  evaluation/feedback/conversation and externally supplied protocol messages
  and checkpoints; **10 scratch/input tests passed**.
- Frozen preceding context no longer contains current source expressions and
  explicitly identifies saved references as `legacy-surface-only`.
- Evidence receives recomputed `current`/`historical` bindings and exact current
  node references. The original replacement probe now marks the removed `abá`
  sense historical with no node references; the UI labels that limitation.
- Scoped Python regressions: **3 passed**.
- `node --test --test-name-pattern='external MCP reads real Navarro'
  electron/tests/studio-mcp.test.cjs`: **1 passed**. A real external stdio client
  selected Navarro website sense **2343**, edited/evaluated scratch, resolved a
  reused construction and checked answer exclusion. Original corpus/reference
  hashes stayed unchanged. Selected engine at this check:
  `sha256:e2949abcea23c1bc523dcaede7ad2b0849882a3e7fe4c58ca13da0ce30b29afd`.
  The initial sandbox run reported Unix socket `EPERM`; the local-listener
  permission retry passed. No provider request was made.

One small consistency follow-up was reported: the scratch restriction helper
also recognizes `excludePassageIds` containing the current passage as
reconstruction. The shared projection and runner must use that same predicate,
including for history/checkpoint clearing. The four principal issues are fixed;
contributor and persistence critic rounds should proceed with this follow-up
covered before final acceptance.

Final consistency follow-up: `isReconstruction` is now shared by the tool exclusions, context projection and runner history reset. An own-passage exclusion triggers the same answer withholding; the input projection regression covers this form.
