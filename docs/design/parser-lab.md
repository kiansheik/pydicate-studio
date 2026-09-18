# Tupi → Pydicate laboratory

A hidden experimental workspace that proposes a Pydicate analysis for a
normalized Tupi string, validates every proposal with the selected engine, and
keeps its own reproducible artifacts. It is a bounded laboratory, not a claim to
analyze unrestricted historical Tupi. See the
[implementation assignment](tupi-parser-lab-implementation.md) for the research
that preceded it and the [probe report](../evaluation/parser-lab-probe.json).

## Enabling and boundaries

The tab is absent by default. **Informações do projeto → Recursos experimentais**
persists the switch in `localStorage` under `studio-parser-lab-enabled`; the
entry point then appears in the header. Revealing it starts nothing: the
workspace module is a separate lazy chunk, the status read is a filesystem
listing, and the Python laboratory worker is spawned only by the first request
that needs the engine.

The analysis opens in the real source/tree editor, bidirectionally: editing the
code rebuilds the tree, and a tree gesture rewrites the code and triggers a fresh
engine evaluation, with the editor's own undo and redo. That state belongs to the
laboratory session alone.

The laboratory never publishes corpus source, never approves a reference and
never calls a provider on its own. **Levar para um rascunho** is an explicit,
confirmed transfer through the existing draft edit path, with undo; it does not
publish or approve. Contributor judgments are appended to a laboratory-only log
that carries `grantsApproval: false`.

## Answer-free context

`parser_lab.engine.LabEngine` builds the namespace with `line = 1`, which loads
the shared lexicon and nothing else. No saved passage expression, alias or
source-local declaration is in scope, so neither the search nor an evaluation
run can be handed its own answer. `context.answerFree` reports this.

## Input profile `lab-v1`

Python owns the profile (`parser_lab/normalization.py`); the renderer mirrors it
only to preview the observation while typing. `src/domain/parser-lab-fixtures.json`
is asserted by both `python/tests/test_parser_lab.py` and
`src/domain/parser-lab.test.ts`, so a divergence fails a test.

Editorial punctuation becomes a space, apostrophes are preserved, then Studio's
relaxed comparator folds case, whitespace and combining marks. The normalized
string is the *only* observation the pipeline receives, so spacing, case and
accents cannot secretly steer a model.

| Input | Observation |
| --- | --- |
| `Asó xe rokype`, `ASOXEROKYPE`, `a so xé ró kŷ pe`, `Asó, xe rokype.` | `asoxerokype` |
| `Açó xe rokîpe` | `acoxerokipe` — a different key |
| `agûaí`, `agûãî` | `aguai` — a real dictionary collision, kept as alternatives |

Historical orthography conversion and OCR repair are **not** applied. They are
later, separately versioned proposal stages that must be able to keep several
readings alive.

## Inference cascade

1. **Retrieve** — exact normalized matches in the index of recorded corpus
   expressions and subexpressions. Labelled `measuresGeneralization: false`:
   useful, but it does not measure generalization, and reconstruction evaluation
   excludes the answer-bearing rows.
2. **Compose** — a chart over typed spans of the observation, assembled under a
   declared root rule. Both surface orders are tried, because the engine (not the
   search) decides whether a constituent is realized before or after another.
3. **Rank** — deterministic coverage/simplicity/provenance ordering, or a locally
   trained ranker when a compatible artifact is explicitly active.
4. **Optional proposals** — a byte-level neural proposer and the existing MCP
   agent enter through the same candidate contract. Neither ran in this
   milestone, and both report their real state rather than a placeholder.
5. **Validate** — editable syntax, resolvable lexical identities, a complete
   evaluation, and a realized form whose normalization equals the *whole*
   observation. Anything else is `partial` or `unknown`, with observed reasons.

Soundness comes from the engine, so the chart's concatenation assumption can
only cost recall, never validity. Nothing is passed through a literal or a
catch-all wrapper and called a parse.

Candidates are deduplicated by the documented structural comparator
(`parser_lab.projection`), so `+ae * ikó` and `(+ae * ikó)` are one analysis with
two spellings, while `(pe * apé)` and `(pe * (ae * apé))` stay two analyses of
one ambiguous surface.

Every request is bounded: observation length, span candidates, engine renders,
AST size, wall time and returned candidates. Exhaustion is reported as
`BUDGET_EXHAUSTED`.

## Grammar families

`parser_lab/grammar.py` declares typed templates over lexical slots. Adding a
family means adding it there with a verified example and a test.

| Family | Type | Template |
| --- | --- | --- |
| `verb_clause` | clause | `(+{subject} * {verb})` |
| `negated_clause` | clause | `-(+{subject} * {verb})` |
| `possessive_np` | np | `({possessor} * {noun})` |
| `bare_pp` | pp | `({postposition} * {noun})` |
| `possessive_pp` | pp | `({postposition} * ({possessor} * {noun}))` |

Root rules: `clause`, `np`, `pp`, and `clause_pp` (`{0} + {1}`).

## Artifacts

Code, schemas, recipes and reports are committed. Generated shards, indexes and
weights live under a project-scoped artifact directory outside Git
(`<userData>/parser-lab/artifacts/<projectId>`, or
`PYDICATE_PARSER_LAB_ARTIFACTS`). The analysis job store is never used for them.

A manifest records the recipe and seed, the normalizer profile, grammar and AST
schema versions, the context fingerprint (engine + lexicon + lab context + lab
code), the lexical snapshot, the split policy, counts, parents, per-file
checksums, runtime and metrics. An artifact is usable only when it is complete
**and** its context fingerprint still matches the live engine; otherwise the tab
offers a rebuild. Activation is atomic and always explicit.

The manifest is written last, by rename, so an interrupted job leaves a staging
directory that is reported as interrupted and never mistaken for a complete
artifact.

## Jobs

`prepare → train → evaluate`, each a separate batch process with NDJSON progress,
real cancellation (SIGTERM, then SIGKILL) and durable control metadata. One
writer at a time. A job that was running when Studio exited is recovered as
`interrupted` and never replayed automatically.

A cancelled or killed preparation leaves its staging directory with a checkpoint
naming the last completed stage. That makes an interrupted run inspectable and
**Descartar restos interrompidos** clears it. Resuming from a checkpoint is not
implemented in this milestone: a rerun starts from the beginning.

Profiles live in `configs/parser-lab/`: `smoke` (a small index for the first
sentence), `baseline` (holdout lexemes and a holdout family) and `large`
(100k–1M examples, with the estimated storage shown before it runs).

## Data and splits

Each generated example records the **original source expression and its
projected source AST** before rendering, the canonical surface, the observation,
the engine annotation and morpheme units, stable lexeme references, construction
lineage, provenance and review status. Reviewed historical data, engine-generated
data and model or agent proposals share this schema but never share evidential
status.

The corpus exporter lives here (`parser_lab.datasets.build_retrieval`) rather than
upstream: `oldtupicorpus/tokenizer/build_corpus_json.py` exports surfaces and
annotations, and its inverse compiler is lossy — on this example it drops the
relational `r` and produces `asó xe okype`. That route is diagnostic only and is
never a training target. Extracting a lossless exporter upstream is future work
and was deliberately not done in this task; no sibling repository was edited.

Groups are formed before splitting: examples that share a normalized surface (or
a parent) always land in the same split, so a normalization collision cannot
straddle train and test. Held-out lexemes and held-out families are separate
suites and never enter training.

## Evaluation suites

Reported separately, each with its denominator:

| Suite | Question |
| --- | --- |
| `normalization_invariance` | Do equivalent inputs give one observation and the same candidates? |
| `known_expression_retrieval` | Can recorded analyses be retrieved faithfully? |
| `new_combinations` | Does composition work with the answer removed from the context? |
| `held_out_lexemes` / `held_out_families` | Where does the declared grammar stop generalizing? |
| `frozen_reviewed_historical` | How useful is this on real text? (No reviewed laboratory set exists yet.) |
| `user_corrections` | Is editing effort falling on genuinely new examples? |

Reconstruction removes the answer expression and its subexpressions from
retrieval. The held-out suites are additionally repeated with the reserved
lexeme or family removed from the index — the honest measurement, because the
declared inventory is a resource the searcher cannot learn.

A rank score is an ordering, not a calibrated probability, and the report says
so in every candidate.

## Commands

```sh
python3 -B scripts/parser-lab/cli.py --parent <pais> --artifacts <dir> prepare --profile smoke --activate
python3 -B scripts/parser-lab/cli.py --parent <pais> --artifacts <dir> analyze "Asó xe rokype"
python3 -B scripts/parser-lab/cli.py --parent <pais> --artifacts <dir> train --activate
python3 -B scripts/parser-lab/cli.py --parent <pais> --artifacts <dir> evaluate --sample 25
python3 -B scripts/parser-lab/cli.py --artifacts <dir> status
```

The tab exposes the same operations, so a run started in the UI can be
reproduced from a script.

## Limits of this milestone

- One declared grammar with five families and four root rules. The searcher does
  not invent lexemes or constructions; with a reserved resource removed it
  returns `unknown`, as the evaluation shows.
- Synthetic composition is not historical accuracy. No frozen reviewed
  historical laboratory set exists yet.
- The ranker trains for real, but on this data almost every contrast is a
  symmetric ambiguity, so it does not beat the deterministic baseline and is not
  recommended for activation. That result is recorded in the artifact.
- The neural proposer is a documented recipe with a dependency check. It was not
  trained, and it says so.
- Agent escalation requires explicit user initiation and a configured provider.
  It did not run.
