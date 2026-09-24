# Tupi → Pydicate laboratory

A hidden experimental workspace that proposes a Pydicate analysis for a
normalized Tupi string, validates every proposal with the selected engine, and
keeps its own reproducible artifacts. It is a bounded laboratory, not a claim to
analyze unrestricted historical Tupi. See the
[implementation assignment](tupi-parser-lab-implementation.md) for the research
that preceded it and the [probe report](../evaluation/parser-lab-probe.json).

## Where it lives

**Sugerir** is a tab in the editor, beside Árvore, because a solver you cannot
reach from the passage you are working on is a demonstration rather than a tool.
It is a projection of the current passage like Morfemas or Código.

The input starts from that passage's transcription, so the form on screen does
not have to be retyped. Each proposed reading offers **Usar esta análise no
rascunho**, which takes it into the draft as an ordinary, undoable edit — the
source and the reference are untouched — and records which reading was chosen,
so the laboratory learns from real work instead of a separate exercise.

With no index, the tab offers **Preparar índice**; an existing index offers
**Repreparar índice**. Every profile includes the supported full Navarro lexical
snapshot; `smoke` only keeps generated training fixtures small. Preparation runs
locally with visible progress. The full laboratory — Dados, Treinar, Avaliar,
Execuções — opens from **Laboratório** in the same tab.

This supersedes the original brief's hidden-by-default switch. Ten minutes of
hunting for a toggle buried in the project information panel showed that hiding
it cost more than it protected. What the switch was really guarding is kept
without it: the workspace module is a separate lazy chunk, reading state is a
filesystem listing, and the Python laboratory worker is spawned only by the first
request that needs the engine. Opening the tab still starts nothing.

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

## Dictionary roots and provisional vocabulary (2026-09-19)

`lexicon.py` snapshots shared predicates and the selected checkout's Navarro
dictionary using its actual Pydicate constructors. The upstream bulk predicate
iterator loses sense IDs and can classify words from labels inside examples;
Studio instead preserves exact dictionary rows and pins verb senses to matching
engine IDs. Portable constructor expressions contain the full definition, so a
chosen reading works in the ordinary authoring namespace without importing a
laboratory alias. Unclassified entries and unmatched verb senses are counted as
skipped rather than assigned a guessed class.

`lexicon.jsonl` and `lexicon-report.json` are checksummed artifact members. The
context includes dictionary data content hashes as well as engine and Studio
code. Changing these requires rebuilding; even an explicit index ID cannot
bypass compatibility. At the checked local snapshot, 7,066 of 8,293 dictionary
senses are supported; 1,227 are skipped. These are lexical coverage counts, not
sentence recognition accuracy.

Root aliases come from the engine's nominal stems and small paradigms: finite
and imperative verbs, possession, locative and nominal past. For example,
Navarro's `ekate'yma` with `(t)` yields `tekate'yma`; `só` supplies the imperative
root `kûãî`, and `angaîpaba` supplies the locative `angaîpápe`. No handwritten
spelling replacement decides validity. `morphology.py` selects matching roots,
proposes productive nominal/verbal/postpositional constructions on demand, and
adds only matching engine realizations to the request's chart. The dictionary
is not multiplied into a precomputed Cartesian product of sentences.

Productive search also tests bound generic/reflexive/reciprocal objects, their
nominal bases, and selected causative → reflexive → nominal paths. For example,
`(potar * moro).var(1)` gives `poropotar`; adding `.base_nominal()` gives
`moropotara`. If a productive noun's actual engine surface matches an indexed
Navarro noun's actual surface, a separate proposal wraps the tree in
`studio_define(tree, exact_dictionary_definition)`. This internal lexical link
preserves accents (unlike the relaxed observation comparator), keeps every
matching sense separate and consumes the same bounded assembly budget.
The direct dictionary entry remains available. Evidence distinguishes component
meanings from whole-node meanings and labels the link `surface-linked`.
Equal form is not etymological proof or full-paradigm equivalence: the derived
nominal realizes `xe moropotara`, the dictionary pluriform noun `xe poropotara`.

On adoption, source-owned `definitionContext` retains lexical base definitions
and explicit whole-node definitions at every nested scope, even when the engine
conversion discards its construction history. The inspector and Studio prompts
consume this hierarchy. Verified shared declarations expand with provenance;
helpers, cycles, stale dependencies and budget exhaustion remain explicit gaps.
Shared lexical publication includes canonical meaning scopes in composite
identity, so equal outer definitions cannot merge distinct inner definitions.
Standalone Pydicate semantic APIs are unchanged.

**Raízes e nomes não cadastrados** accepts up to eight explicit root/category
hypotheses (noun, proper noun, intransitive/transitive/second-class verb), with
no invented definition. These are additional contributor assumptions, separate
from the normalized observation; capitals alone never imply a proper noun.
Existing dictionary nouns/verbs cannot be silently reclassified through hints.
Any candidate using a hypothesis is `partial` with provisional lexical evidence,
even when its syntax fully evaluates and reproduces the whole input. Selecting
it keeps that evidence in the judgment and does not create a complete historical
evaluation example. Hints are not permanent lexical declarations.

Dictionary senses remain distinct when morphology alone cannot distinguish
their meanings. Repeated homographs with multiple senses conservatively retain
their structures so sense order is not lost. Empty-surface annotation tags and
bare text are scanned with a finite Studio parser, preserving emitted evidence
without the upstream parser's orphan-tag loop.

Root, argument, span, assembly, result and time limits are reported as truncation;
the UI never promises every possible reading. Productive templates remain
bounded, chart composition still assumes constituent surface concatenation,
and unrestricted historical language recognition is unmeasured. Unknown roots
require explicit hints; there is no automatic catch-all literal analysis.

## Inference cascade

1. **Retrieve** — exact normalized matches in the index of recorded corpus
   expressions and subexpressions. Labelled `measuresGeneralization: false`:
   useful, but it does not measure generalization, and reconstruction evaluation
   excludes the answer-bearing rows.
2. **Expand roots and compose** — query-directed dictionary morphology augments
   the indexed fragments, then a chart over typed spans is assembled under a
   declared root rule. Both surface orders are tried, because the engine (not the
   search) decides whether a constituent is realized before or after another.
3. **Rank** — deterministic coverage/simplicity/provenance ordering, or a locally
   trained ranker when a compatible artifact is explicitly active.
4. **Optional proposals** — a byte-level neural proposer and the existing MCP
   agent enter through the same candidate contract. Neither ran in this
   milestone, and both report their real state rather than a placeholder.
5. **Validate** — editable syntax, resolvable lexical identities, a complete
   evaluation, and a realized form whose normalization equals the *whole*
   observation. Explicit unresolved lexical hypotheses remain `partial` despite
   complete engine evaluation. Failed matches are `unknown`, with observed reasons.

The ordinary canvas **Criar peça** form also accepts explicit noun/verb grammar
and hypothetical roots with an empty meaning. Reviewed shared roots retain
`lexicalStatus: hypothetical`; rebuilding the index makes their other engine
forms available without upgrading lexical uncertainty. Status is checked in
the realized source tree as well as fragment evidence, because verbal
annotations may omit custom tags. Suggestion hints carry the same persistent
status when adopted into a draft. Identical output cannot merge a provisional
root with an otherwise unmarked one.

Soundness comes from the engine, so the chart's concatenation assumption can
only cost recall, never validity. Nothing is passed through a literal or a
catch-all wrapper and called a parse.

## One answer, or a choice?

Every returned candidate realizes the whole observation, so "same surface"
separates nothing. Two finer notions decide, and the engine supplies both:

- **Annotation-identical** — the engine emits byte-identical annotated output,
  so the grammar makes the same morphological claim about every surface unit.
  When lexical sense identities and scoped construction signatures also agree,
  these are one answer written twice
  and are merged, with the other spelling kept
  under `annotationIdenticalSources`. `(+nde * ikó)` and `ikó * +endé` merge.
- **Co-generating** — both realize the observation but annotate differently, so
  the surface genuinely does not decide. `(pe * apé)` and `(pe * (ae * apé))`
  differ by exactly `PLURIFORM_PREFIX:S:ABSOLUTE` versus `PLURIFORM_PREFIX:S`:
  unpossessed against third-person possessed. Both are shown, each with the
  precise tag difference from the first reading, and the contributor picks.

Distinct dictionary meanings are also separate choices even when their
annotations agree; their lexical evidence names the relevant Navarro senses.
Nominalized source structures and nested `studio_define` scopes are retained
even when the engine flattens them into identical nominal annotations. Only
annotation-neutral `.var(integer)` alternatives may collapse within the same
scoped structure; their source spellings remain available.

Co-generating readings are **presumed mutually acceptable**: never scored as an
error against each other, never used as a training contrast. Only a contributor
judgment demotes one, because only a reader can decide which reading a passage
intends. Source spelling alone still never creates a second analysis: `+ae * ikó`
and `(+ae * ikó)` are collapsed by the structural comparator first.

Scoring reports three levels and never conflates them: `top1Exact` (the
generating expression itself), `top1AnnotationSame` (a reading the grammar
annotates identically), and `completeRate` (any validated reading).

## Learning from use

The laboratory keeps three local records, each with different evidential weight:

| Record | What it is | What it is for |
| --- | --- | --- |
| `attempts.jsonl` | every analysis and its outcome, deduplicated | coverage gaps: the inputs this laboratory could not analyse, and which pieces it did recognize |
| `judgments.jsonl` | explicit verdicts with the whole set that was on screen, which reading was chosen, and whether a correction had been proposed at all | confirmed readings and decided preferences |
| `feedback.json` | the derived examples, preference pairs and gaps | a reusable export for training |

Choosing one of the readings on screen is itself a preference over the others.
A reading that was passed over is `not-preferred`: still a possible reading, not
an error, and weaker evidence than an explicit rejection — the two are kept
distinguishable by `strength` on each derived pair. So a single click produces
usable supervision, without claiming the other reading is ungrammatical.

A judgment takes effect **immediately**: the next analysis of that observation
orders confirmed, presumed, not-preferred, rejected — each labelled — before any
training run. Nothing is hidden; a rejected reading still validates, and showing
it is what keeps the decision reviewable.

Training then has real supervision. Because the validator is sound, a generating
expression is not evidence that the alternatives are wrong, so **decided pairs
are the only contrasts trained on**; undecided co-generating pairs are counted
as `coGeneratingSkipped` and skipped. A preferred reading the search never
proposes is a *coverage* failure, counted separately as
`judgmentsPreferredNotProposed`, and no ranker can fix it.

Confirmed and corrected readings become reviewed examples on real input with
`provenance: contributor-confirmed` / `contributor-corrected` and
`reviewStatus: lab-reviewed`. They populate the `frozen_reviewed_historical`
suite, which is otherwise empty. `grantsApproval` stays `false`: this is
laboratory evidence, never corpus editorial approval.

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
- Ranking supervision cannot come from the generator. Every candidate realizes
  the observation, so only a contributor judgment can separate two readings. A
  fresh laboratory therefore trains on nothing and says so; the deterministic
  ordering stays active until judgments exist.
- The neural proposer is a documented recipe with a dependency check. It was not
  trained, and it says so.
- Agent escalation requires explicit user initiation and a configured provider.
  It did not run.
