# Tupi → Pydicate Lab: research and implementation prompt

Research date: 2026-09-18. Branch: `codex/tupi-parser-lab`.
Studio base: `8d21298c41ac5e5a66877b64ed96e02f00d31e56`.

## Decision and readiness

Build a hidden experimental workspace inside Studio. Reuse the existing grammar,
source AST, editable tree, interpreter, dictionary, structure index, job ownership,
and MCP/provider infrastructure. Add the missing inverse pipeline: normalized
Tupi → candidate expressions → engine validation → ranking → editable result.

The repositories already support a credible first offline experiment. They do
not yet establish reliable analysis of arbitrary historical Tupi. The main gap
is an ambiguity-aware inverse search and a trustworthy evaluation/data contract,
not a shortage of synthetic rows or a need to build another tree editor.

Start with indexed lexical/grammatical fragments and bounded composition. Train
a small candidate ranker once that works. Make byte-level neural proposals and
the existing MCP agent optional additions behind the same candidate interface.
Training prepares reusable artifacts; typing a sentence never retrains a model.

This commit contains research and an implementation specification, not the tab.
The section **Implementation agent assignment** is the task to execute.

## What was actually tested

See [the machine-readable report](../evaluation/parser-lab-probe.json) and
[the runnable probe](../../scripts/experiments/probe-parser-lab.py).

The probe used disposable copies of the recorded dependency revisions with
Studio's existing dependency patches applied. It did not change sibling repos,
call a paid model, or operate the native UI.

| Experiment | Observed result | Limit |
| --- | --- | --- |
| Generate reusable fragments | 25 finite verb clauses and 120 possessive postpositional phrases | Five pronouns, five verbs, six nouns, four postpositions |
| Compose expressions from an unsegmented string | Original source recovered among candidates for 60/60 sampled combinations | Only one composition family; fragments and the rule were available; this is not historical accuracy |
| Full-sentence reverse lookup | Zero complete sentences indexed in that probe | Production may also retrieve known sentences, but must label that route |
| `Asó xe rokype` and spacing/case/accent variants | `asoxerokype` → `(+ixé * só) + (pe * (ixé * oka))` | Valid under the selected engine and lexicon, not proof of a unique linguistic interpretation |
| Shared authoring code | Complete rendering; editable source AST with ten nodes | Native Electron interaction still needs implementation-time verification |
| Actual source-span tree edit primitive | Replace `ixé * oka` with `nde * oka` → `asó nde rokype` | Tests the shared operation, not a simulated UI claim |
| Existing decompiler, supplied gold annotations | Produces `asó xe okype`, losing the relational `r` | Never use this route as unquestioned training truth |
| `Açó xe rokîpe` | Folded key `acoxerokipe`; no candidate | Historical orthography conversion is outside this first version |
| Real dictionary accent collisions | `ãgûa` / `agûá` → `agua`; `agûaí` / `agûãî` → `aguai` | Accent stripping destroys information; preserve alternatives |

The small warm Python search took milliseconds per sampled sentence; exact
timings and environment are in the report. That excludes Electron IPC, cold
startup, a large index, broad search and model inference. It is not a production
latency promise.

The engine's morphology for the example is:

| Surface unit | Existing engine tags |
| --- | --- |
| `a` | `SUBJECT_PREFIX:1ps` |
| `só` | `ROOT` |
| `xe` | `POSSESSIVE_PRONOUN:1ps` |
| `r` | `PLURIFORM_PREFIX:R` |
| `ok` | `ROOT`, `ROOT`, `SUBSTANTIVE_SUFFIX:CONSONANT_ENDING` |
| `y` | `SUBSTANTIVE_SUFFIX:CONSONANT_ENDING:CLITIC` |
| `pe` | `POSTPOSITION:LOCATIVE` |

These are the current engine's surface units and tag bundles. Preserve their
provenance; do not reinterpret duplicate tags or every surface unit as a
separate semantic morpheme without a reviewed grammar change.

The earlier repository audit found 120 committed approved historical rows and
122 historical tokenizer rows at the audited corpus revision, with repeated
surfaces across sources. Synthetic metadata records roughly two million rows.
Studio's newer documentation describes a later local corpus of 129 expressions.
Recount the selected project at runtime; none of these counts is a guaranteed
inventory of the user's current local data. The old tokenizer notebook's token
F1, low exact-sequence result and random row split are not an end-to-end parser
benchmark. Large row counts do not create new construction coverage.

## Implementation agent assignment

You are implementing **Tupi → Pydicate Lab** in `kiansheik/pydicate-studio`.
Complete a working experimental vertical slice, data preparation, a real small
training/evaluation path, and a repeatable first native-UI test. Do the work,
not merely another design document. Keep it on `codex/tupi-parser-lab`; do not
merge to main. If that branch is already checked out, continue it. If there are
user changes, preserve them and use an isolated checkout when necessary.

Read `AGENTS.md`, its required agent docs, this document, and the implementation
files below before editing. Reconcile any newer code with this plan. Current
Studio already has iterative Codex/Claude tool execution, a persistent queue,
scoped MCP and an isolated learning workspace. Do not rebuild those systems
based on an older guide that describes them as missing.

### 1. Product contract

Add an experimental tab, labelled in Studio's existing Portuguese style, such
as **Tupi → Pydicate**. It is absent by default. A persisted switch under
experimental/project settings reveals it. It must lazy-load and start no
generation, training, indexing, model download or provider call just because
Studio opens or the tab becomes visible. Hiding it returns to the normal
workspace without changing the existing draft or layout.

The main interaction is a textbox and **Analisar**. The textbox strips Unicode
whitespace, case and diacritics. Show the resulting normalized input, then:

1. Best proposed Pydicate source, restored engine surface and editable tree.
2. Alternative analyses when appropriate; provenance such as indexed,
   composed, trained proposal or agent-assisted.
3. Engine morpheme units/tags, coverage, validation status and unresolved spans.
4. A concise explanation when nothing valid was found, and a useful next action.

This is analysis into Pydicate, not a Portuguese translation feature. Keep
pipeline configuration and long technical traces in expandable details.

Use the real source/tree editor bidirectionally. Code changes rebuild the tree;
tree gestures update source with normal undo/redo and engine re-evaluation.
The lab has its own draft/session state. It must not overwrite the open corpus
passage, human translation, source file, reference or approval. Copy/export is
available. An explicit transfer to a normal draft can use the existing adoption
path with revision checks and undo; it must never silently publish or approve.

Centralize preparation in this tab through simple sections: **Analisar**,
**Dados**, **Treinar**, **Avaliar**, and **Execuções**. These can be local sections
of one workspace, not new global tabs. Provide **Preparar baseline** so a new
user can make a small local index and run the first sentence from the UI without
separately invoking a CLI. Expose the same operations to scripts for repeatable
work. Persist job progress, results and useful failure messages.

### 2. Mandatory reuse map

| Need | Existing implementation to inspect/reuse | Required extension |
| --- | --- | --- |
| Navigation and isolation | `src/App.tsx`, `src/components/LearningWorkspace.tsx` | Hidden lazy workspace; isolated lab editor state using the learning workspace's pattern |
| Editable tree and gestures | `src/components/RuntimeTree.tsx` (`PydicateTree`), `ExpressionCanvas.tsx`, `src/domain/canvas.ts`, `tree-operations.ts`, `expression-tree.ts` | Host the same editor; avoid copying its implementation |
| Headless builder operations | `electron/authoring/shared-entry.ts`, `electron/shared-authoring.cjs` | Use the same transforms for candidate edits and any MCP adapter |
| Source syntax and preservation | `python/studio_authoring.py` | Reuse typed source AST, spans, permitted operators/methods and transactional edits |
| Evaluation and lexicon binding | `python/authoring_runtime.py`, `python/authoring_service.py` | Explicit lab lexicon context, bounded interpretation, isolated snapshots and current-engine validation |
| Reverse lookup and normalization | `python/rendered_structures.py` | Reuse relaxed normalizer and verified structure resolver; extend with fragment indexes and bounded composition |
| Worker boundary | `python/worker.py`, `electron/python-worker.cjs`, existing IPC/preload/type validation | Narrow lab commands; separate lifecycle for long batch work |
| Durable jobs and provider ownership | `electron/analysis-service.cjs`, `analysis-store.cjs`, `agent-runner.cjs` | Reuse ownership/cancellation/event conventions; separate large artifact storage |
| Tool-assisted analysis | `electron/scratch-service.cjs`, `studio-mcp-gateway.cjs`, current provider adapters | Explicit lab task context through the existing loop, with the same validated builder tools |
| Honest reconstruction evaluation | `scripts/build-authoring-eval.py`, existing evaluation exclusions | Extend split/leakage controls to normalized strings, synthetic families and lab retrieval |
| Dependency diagnosis | `scripts/check-project.py`, `docs/design/dependencies.md`, `next-baseline.json` | Report selected versions/patches and artifact compatibility |
| Synthetic data | Corpus `synthetic/`, `tokenizer/`, historical sources and approved JSONL | Read/adapt existing generation concepts; capture original expressions at generation time |

The runtime tree is a diagnostic graph, not the source-authoring truth. Do not
invent a second visual AST or try to reconstruct editable source from runtime
object IDs. A training projection may reference the existing source schema and
remove volatile positions/IDs; its serializer must round-trip through the
existing parser and editor. Preserve grouping, operator order, omission and
variants. Similar rendered strings do not authorize algebraic simplifications.

Existing evaluation often needs a passage ID/source position. Add an explicit,
answer-free lab context with selected lexicon/declaration provenance. Do not
bind inference to a corpus passage whose saved expression supplies the answer,
or create invisible human drafts merely to satisfy an API parameter.

### 3. Input and ambiguity contract

Reuse `rendered_structures.normalize(..., relaxed=True)` as the starting
normalizer, under a named versioned lab profile. Keep ordinary strict Studio
comparisons unchanged. Make Python authoritative and test frontend parity for
Unicode normalization, case folding, pasted whitespace and combining marks.
Handle composition events and caret position in the textbox. Preserve meaningful
apostrophes; define punctuation behavior explicitly rather than stripping every
non-ASCII character. Validate blank and excessive-length input.

For this version, the sole inference observation is the normalized string.
Raw input may be retained for audit/undo, but spacing, case and accents must not
secretly guide the model or agent. Equivalent normalized inputs with the same
context/configuration must produce the same deterministic baseline candidates.

`Asó xe rokype`, `ASOXEROKYPE`, and `a so xé ró kŷ pe` all become
`asoxerokype`. There are no gold word boundaries. Search must recover segmentation.
`Açó xe rokîpe` is not made equivalent by this operation: `ç → c` and `î → i`
still leave a different key. Do not silently add historical sound/spelling
substitutions. Historical normalization and OCR correction are later, separately
versioned proposal stages that can preserve multiple readings.

Keep a list of candidates for colliding keys. The real dictionary examples
`ãgûa` (vid 2452) / `agûá` (2453), and `agûaí` (2454) / `agûãî` (2456)
should inform collision tests at the lexical index layer. This does not require
those lexemes to belong to the initial sentence grammar. Do not use their
distinct training targets as mutually exclusive negatives. A rank score is not
a calibrated probability. Report ambiguity or insufficient evidence explicitly.

### 4. Inference pipeline

Implement a common candidate/result contract and a bounded cascade:

1. **Retrieve:** exact normalized matches in a versioned index of verified
   expressions/subexpressions. Preserve different structures, senses and sources.
   Label known-sentence retrieval; it is useful but does not measure generalization.
2. **Compose:** build possible span matches over the unsegmented input using
   indexed generated fragments. Search a small typed grammar of supported
   Pydicate operations using a chart or bounded beam. Generate candidate source
   with stable lexical bindings and evaluate it through the shared interpreter.
   Start from the demonstrated finite-clause + possessive-PP family, then add
   independently verified constructions and their tests. Avoid a sentence-key
   special case for `asoxerokype`.
3. **Rank:** start with deterministic coverage/validity/complexity/provenance
   scoring, then apply a locally trained ranker when a compatible artifact is
   active. Retain diverse structurally distinct candidates.
4. **Optional proposals:** a trained character/byte model may propose morphemes
   or serialized ASTs; the existing MCP agent may search/edit/evaluate candidates
   when explicitly requested. Both use the same validation and result contract.
5. **Validate and return:** require permitted syntax, resolvable lexical
   identities, complete evaluation and full normalized surface agreement for a
   complete proposal. Return partial/unknown honestly when none qualifies.

Do not assume independent fragment concatenation models all morphology.
Allomorphy, sandhi and operations can depend on the parent expression. The first
probe is a valid limited family, not a universal tokenizer. Keep search adapters
for context-sensitive realizations and always render the assembled expression.
Avoid a second handwritten conjugator; obtain forms from the existing engine.

Place finite bounds on input length, AST depth, candidates, beam/chart states,
wall time and output size. Memoize immutable expressions/results keyed by engine
and lexicon fingerprint; never share mutable Predicate instances across attempts.
Use `isolated_namespace` and evaluation snapshots where the engine mutates state.
Cache or batch namespace work rather than invoking a fresh Python child per
generated row. Keep heavy work out of the synchronous interactive worker.

The internal result needs: normalized input/profile, context and artifact
fingerprints, candidate source/AST, lexical bindings, restored surface,
annotations/morpheme bundles, source-tree editability, completeness, covered
spans, score with meaning, provenance, timings and structured rejection reasons.
Use offsets in a declared coordinate system and occurrence IDs for repeated
morphemes. Do not pretend current root-level IDs are reliable per-node alignments.
Add measured alignments where available and mark missing ones explicitly.

A matching surface is necessary but not proof of the correct analysis. Do not
pass arbitrary input through `Tok`, `Seq`, an unanalysed literal noun, or similar
fallback and call it a complete morphological parse. Such legacy compiler output
can be diagnostic only. Unknown lexical creation requires an explicit tentative
status and human review; it is not validated simply because it echoes the input.

### 5. Reproducible data and artifact system

Add a small lab package/config/schema area in Studio, for example
`python/parser_lab/`, `scripts/parser-lab/`, `configs/parser-lab/`, and matching
UI/service modules. Follow existing conventions if a better location already
exists. Commit code, schemas, recipes, small fixtures and reports. Put generated
shards, indexes, logs and checkpoints under a configurable project-scoped
artifact directory outside Git. Do not fill the existing analysis-store JSON
with millions of examples or weights; its current size cap is 64 MB.

Provide versioned, machine-readable manifests containing selected repo revisions
and dirty-content fingerprints, dependency patches, normalizer and AST schema
versions, generator recipe/seed, lexical snapshot, grouping/split policy, row
counts/deduplication, parent artifacts, checksums, runtime/dependencies, metrics
and completion status. Engine/lexicon/config changes invalidate affected
artifacts and show a repair/rebuild action. Activation is atomic and explicit.

The job stages are snapshot → extract/generate → group/split → build indexes →
train → evaluate → activate. Index-only baseline preparation skips training.
Expose counts, elapsed time, failures, cancellation and resumable checkpoints.
Use one writer per artifact, atomic manifests and interrupted-state recovery.
Cancellation must reach batch subprocesses. Persist control metadata using
existing ownership conventions or a small appropriate database, not a new
distributed queue. Do not retry paid jobs after a restart.

Implement a streaming generator with a smoke profile, a modest baseline profile
and configurable larger profiles, including 100k/1M examples where feasible.
Show estimated storage and configured limits. Run a bounded smoke job during
implementation, not an unbounded all-combinations expansion. Reuse verified
operators/templates and balance construction/lexeme coverage; avoid letting
trivial combinations dominate the dataset.

Each example records the **original source expression and source AST** before
rendering, canonical surface, normalized input, engine annotations, available
morpheme spans/features, stable lexeme references, construction/family lineage,
provenance and review status. Surface-only legacy exports cannot retroactively
provide trustworthy original trees. `tokenizer/build_corpus_json.py` currently
exports surfaces/annotations; do not make its lossy inverse compiler the target
generator. Port/adapt the needed exporter inside Studio without editing sibling
repos in this task, and document any future upstream extraction.

Separate reviewed historical data, unreviewed historical source, engine-generated
data, noisy augmentations and model/agent proposals. They can share a schema,
but they do not share evidential status. Teacher output becomes a proposal until
reviewed. Capture corrections as append-only lab judgments bound to input,
candidate, context and artifact versions. Training opt-in/promotion never grants
corpus editorial approval. Avoid repeatedly logging unchanged tree gestures as
new training examples.

Split parent examples before augmenting. Group duplicates across both historical
sources, expression lineage and normalization collisions so simple variants
cannot straddle train/test. Maintain separate holdouts for new combinations,
new lexemes and new construction families. Fit vocabularies/features/rankers
only on the training split. Record permitted lexical resources explicitly.

For reconstruction evaluation, extend the existing leakage-exclusion machinery:
exclude the answer expression, its answer-specific aliases/declarations,
retrieval descendants that reveal the answer, and normalized duplicates from
the full inference context. Lexical entries needed for the task can remain;
answer-bearing examples cannot. Production retrieval has no artificial holdout,
but its success rate must be reported separately from reconstruction.

### 6. Training choices and efficient execution

**Required first trainable component:** a small CPU-friendly candidate ranker
with a real fit/save/load/evaluate path. A linear/logistic or pairwise ranking
model with character n-grams, lexical/construction priors, morphology agreement,
coverage and complexity features is sufficient initially. Reuse useful tokenizer
utilities after correcting their split/data contracts. The old notebook model
is a baseline to compare, not evidence it solves parsing.

Generate hard alternatives using the same proposer the runtime uses. Train only
where there are meaningful competing candidates; a set containing only the
answer proves nothing about ranking. Allow multiple acceptable answers and
unlabelled alternatives. Build a small reviewed or controlled contrast set
whose acceptability is known. Surface validation can remove clear mismatches;
it cannot label all same-surface alternative trees as wrong. When data cannot
justify improved ranking, report that result and keep the deterministic baseline
active. Do not invent a confidence percentage or a successful training metric.

**Next neural experiment:** use a byte/character seq2seq proposer, with ByT5-small
as an initial pretrained recipe via maintained Transformers/PyTorch APIs.
Compare normalized-input → morph analysis and normalized-input → a stable
serialization of the existing source AST. Token-free byte input suits the
unsegmented/diacritic-stripped channel, but task accuracy must be measured.
Neural output supplies candidates; it does not replace the grammar validator.

Provide a documented optional recipe/adapter and dependency group, explicit model
download, seed, device selection, bounded training, checkpoints/resume and the
common evaluator. CPU/CUDA/MPS support is conditional on the actual environment;
do not assume the word “small” makes pretrained training cheap. A missing model
or accelerator must not block the offline first sentence. Do not claim a neural
model was trained unless it actually was. A real small ranker smoke run is
required; a large pretrained fine-tune is not a prerequisite for this milestone.

Begin with parse-and-validate constrained beam candidates. Incremental AST/grammar
constraints can later reduce invalid neural output; PICARD is a design precedent,
not a drop-in Pydicate parser. Finite-state tooling such as Pynini may improve
lexical morphology and later historical/OCR candidate lattices if profiling
justifies it. Do not force arbitrary Pydicate syntax into an FST or reimplement
the grammar solely to adopt a library.

Reuse the current MCP loop as an optional escalation/annotation assistant and
source of human-reviewed hard cases. Add a lab task mode rather than a new agent
framework. Current normal candidate workflows require tentative Portuguese
translations: adapt the lab-specific contract without weakening that normal
workflow or turning translation into an unnecessary required parsing stage.
Keep dictionary/tool context answer-free during evaluation. Ordinary parsing
must not invoke grammar repair. Provider calls require explicit user initiation
and the existing budget policy; automated tests use fixtures and spend no tokens.

### 7. Metrics and evidence

Keep the following suites distinct in the UI/report:

| Suite | What it answers |
| --- | --- |
| Normalization/invariance | Do equivalent case/space/diacritic inputs produce the same observation and baseline candidates? |
| Known-expression retrieval | Can the current artifact retrieve known analyses faithfully? |
| New combinations of known fragments | Does composition work without a stored full-sentence answer? |
| Held-out lexemes/families | Where does the declared grammar/proposer stop generalizing? |
| Frozen reviewed historical examples | How useful is this on real text without answer leakage? |
| New user corrections | Is editing effort falling on genuinely new examples? |

Report candidate recall@k, top-1 accuracy against acceptable structural analyses,
stable lexeme/feature recovery, morpheme sequence/span metrics where aligned,
complete/partial/unknown rates, surface agreement, ambiguity, and human correction
effort. Show exact denominators and failed cases. A high tag F1 or valid surface
is not an exact Pydicate accuracy claim. Use a documented structural comparator;
ignore harmless source formatting/runtime IDs without declaring different
linguistic structures equivalent just because their strings match.

Measure cold preparation, warm lookup/search, full UI request latency, memory,
disk and optional provider cost separately. Compare retrieval-only,
retrieval+composition, ranker, and optional neural/agent configurations on the
same frozen split. Calibrate confidence only if enough independent reviewed
data exists. Keep a small untouched prospective set for later human evaluation.

### 8. Implementation sequence and completion gates

**Milestone A — dependencies, schema and first vertical slice.** Diagnose the
selected project read-only. Studio records dependency bases
`nhe-enga@348686045bf0791c847be3cba1b15eaae7312a11` and
`oldtupicorpus@292a28722a1790abf3f3b93083c29fbd47b4ffd0`, plus patches in
`docs/design/dependency-patches/`. Raw published engine alone has known mismatches
such as missing `Number.base_nominal`; the documented patches resolved the
probe's startup issue. Detect compatible newer code rather than requiring an
exact old checkout. Never apply patches blindly to a user's dirty sibling repo.
Use disposable snapshots for tests when needed and report the actual fingerprint.

Build the hidden tab, explicit lab context, normalizer, candidate schema,
fragment generation/index, bounded compositional baseline and shared tree host.
Deliver the offline sentence path before broad model work. Do not make a large
model download or provider credential a requirement for opening this path.

**Milestone B — durable preparation.** Implement the artifact manifests, streaming
generator, grouped splits, resumable/cancellable jobs, index build and UI controls.
Run the small preparation profile from the tab and CLI. Verify restart recovery,
fingerprint invalidation and that the normal editor stays responsive.

**Milestone C — learning and evaluation.** Implement and actually run the small
ranker training/save/load/evaluation path on meaningful contrasts. Preserve
baseline comparison and activate only explicitly. Wire the optional neural
recipe and existing-agent adapter through the same contract; report their
unrun/blocked status accurately. Add correction capture without publication.

**Milestone D — native end-to-end proof and handoff.** Use an isolated Electron
profile with the real Python bridge and compatible dependencies. Record:

1. The tab is absent in a fresh profile, appears when enabled, and persists that
   preference after restart. Hidden mode launches no preparation/model job.
2. From an unprepared lab, **Preparar baseline** completes and the first sentence
   runs without hand-editing artifacts or making provider calls.
3. `Asó xe rokype` is visibly stripped to `asoxerokype`, yielding the expression
   below, or an explicitly equivalent source structure, restored surface, the
   real editable tree and the engine's morpheme tags.
4. The same happens for normalized/case/space/accent variants. Input `zzzz`
   returns unknown/incomplete rather than a fabricated complete parse.
5. A full sentence absent from the full-sentence index is composed successfully;
   for example `ereso nde rokype` with the corresponding supported lexemes.
   Assert absence in the index and capture route provenance. Also sample fresh
   held-out combinations beyond the single demonstration family where supported.
6. Editing the example's possessor in the actual tree to `nde` changes source and
   surface to `asó nde rokype`; code edits also update the tree. Undo/redo works.
   Ordinary corpus drafts/source/reference hashes are unchanged.
7. Collision tests preserve alternative lexical identities; stale artifacts,
   changing input during a pending run, cancellation and interrupted jobs cannot
   overwrite a newer result or falsely show completion.
8. Training produces a real artifact that survives reload; evaluation shows
   the actual split, metrics and baseline comparison. Unavailable optional neural
   models or providers have actionable states, not placeholder success panels.

Expected example:

```python
(+ixé * só) + (pe * (ixé * oka))
# selected engine surface: asó xe rokype
```

Run focused domain/Python/service/UI tests and the repository's relevant build
and documentation gates. Distinguish pre-existing dependency/corpus failures
from new regressions; do not rewrite historical sources or approvals to make
a test green. Record actual commands and results. Mock browser tests supplement,
but do not replace, the native bridge proof. Capture a screenshot of the first
successful tab result and inspect it for usability.

Update the agent current state, log and session handoff. Commit small coherent
changes on this branch. End with exact enable/prepare/analyze instructions, the
first result, artifact location, tested construction coverage, remaining limits,
tests run, and any optional model/provider work that remains unrun. If a resource
blocks a larger experiment, complete the offline baseline and explain the block;
do not leave the core tab as a TODO.

### 9. Boundaries for this milestone

Implement a useful bounded laboratory, not a claim to solve unrestricted Tupi.
No OCR image pipeline, automatic historical orthography conversion, automatic
grammar modification, corpus publication, editorial approval, unlimited data
generation, mandatory cloud service or new general-purpose agent framework.
Keep extension points for historical readings/noise models and additional
grammar families without presenting them as implemented functionality.

The successful first delivery is a real hidden Studio tab that can prepare its
own baseline, analyze a new simple normalized sentence, expose competing
analyses and morphemes, edit the result with the existing tree, and run a small
reproducible training/evaluation cycle. Broader accuracy is then an empirical
improvement program inside that same workspace.

## Research sources and rationale

- [ByT5 paper](https://arxiv.org/abs/2105.13626) and
  [current Transformers ByT5 documentation](https://huggingface.co/docs/transformers/en/model_doc/byt5):
  byte-level seq2seq avoids a language-specific token vocabulary. This makes it
  a reasonable experiment for this input channel, not evidence of Tupi accuracy.
- [PICARD](https://aclanthology.org/2021.emnlp-main.779/): incremental parsing can
  reject inadmissible decoder continuations. A Pydicate implementation would
  still need constraints from its own supported grammar and lexical bindings.
- [Pynini](https://aclanthology.org/W16-2409/): weighted finite-state grammar
  compilation is relevant to lexical/spelling candidate generation. It does not
  replace compositional Pydicate syntax or validation.

These recommendations are an engineering inference from those methods and the
repository experiments. No external model was trained or benchmarked on this
project during this research task.

## Reproducing the bounded research probe

Prepare disposable sibling directories `nhe-enga/` and `oldtupicorpus/` at the
recorded bases and apply the patches described in
[dependencies.md](dependencies.md) after checking they apply. From Studio:

```sh
python -B scripts/experiments/probe-parser-lab.py \
  --parent /path/to/disposable-dependency-parent \
  --output /path/to/new-probe-report.json
```

The script reads the selected dependencies and writes only the requested report.
It exercises the actual shared parser/interpreter and tree-span transaction.
It is deliberately a small research probe; production code should extract
reusable pieces thoughtfully rather than import an experiment as its API.
