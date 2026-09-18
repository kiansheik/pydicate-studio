# Pydicate structural search: Grew experiment and integration decision

Research date: 2026-09-18. Branch: `codex/tupi-parser-lab`.

## Recommendation

Keep Studio's source tree, grammar and editor. Add a small graph adapter and
evaluate the **Grew engine through grewpy**, behind Studio's existing Python
boundary. Grew-match is a search application built on that engine; adopting its
entire web application is a separate choice. A UD conversion is unnecessary:
Grew accepts custom node features and directed, labelled edges, including
unordered nodes. This can represent the Pydicate source tree directly.

Do not port Grew's OCaml implementation before comparing useful queries. The
research baseline below establishes that a narrower native implementation is
feasible at the present corpus size. It does **not** establish that it is faster,
more correct or more useful than Grew. Choose the production matcher after an
actual Grew run and a desktop packaging check, retaining the same graph/result
contract either way.

## What was actually run

The [probe](../../scripts/experiments/probe-structural-search.py) reads historical
sources through existing `source_entries` and `expression_tree` functions. It
does not execute corpus or grammar code. The selected public checkout is
`oldtupicorpus@292a28722a1790abf3f3b93083c29fbd47b4ffd0`; it may be older than a
contributor's working corpus.

- Exported **122 expressions / 1,895 source nodes**: 82 Araújo and 40 Bettendorff.
- Ran 11 structural queries with a small native reference matcher, checking
  hand-specified results over 14 synthetic controls. Controls distinguish
  argument direction, direct children from descendants, inner from outer
  negation, repeated occurrences, keyword arguments, aliases and opaque syntax.
- Verified all 1,964 exported node spans, including controls, against Studio's
  UTF-16 source offsets; an emoji control exercises non-BMP text.
- Verified both historical source files remained unchanged.

Selected native results:

| Exact source-tree query | Bindings | Distinct historical expressions |
| --- | ---: | ---: |
| Explicit `.perm()` operation | 8 | 8 |
| `*` with another `*` as its right child | 157 | 75 |
| Unary `-` below an `.imp()` operation | 1 | 1 |
| Unary `-` containing an `.imp()` operation | 7 | 7 |
| `.imp()` with no unary `-` below it | 22 | 22 |
| Two distinct references with the same lexical name | 166 | 32 |
| `.base_nominal()` immediately applied to `.var(1)` | 4 | 4 |

Bindings and expressions are different units. Two matching occurrences in one
expression count twice. The repeated-reference query returns ordered bindings,
so swapping `X` and `Y` is another match; it does not establish linguistic
coreference. The shape `ixé * oka` finds the synthetic example but **zero**
historical occurrences in this checkout.

The [report](../evaluation/structural-search-probe.json) contains generated Grew
requests, counts, source-bound examples, hashes and native timings: median of
three warm runs over 136 graphs, including controls. Queries take milliseconds
on this small corpus here. These are not Grew or large-corpus benchmarks.

**Grew execution remains unverified.** This environment lacks OCaml/opam and
`grewpy_backend`. System package setup failed on unavailable user/group-switching
permissions. The Python wrapper alone cannot supply the backend. The report
records `grew.status: unavailable`, `bindings_compared: false`; `--grew` exits 2.
No corpus was uploaded to a hosted service. No product UI was implemented.

## Reproduce and run Grew

The native probe needs only Python and a readable corpus checkout:

```sh
python -B scripts/experiments/probe-structural-search.py \
  --corpus ../oldtupicorpus \
  --output /tmp/structural-search-native.json \
  --export /tmp/pydicate-grew-graphs.json
```

To test Grew, follow the official [OCaml/opam setup](https://grew.fr/usage/install/)
and [grewpy setup](https://grew.fr/usage/python/). With initialized opam and a
selected Python environment, the inspected versions can be installed as:

```sh
opam repository add grew https://opam.grew.fr
opam install grewlib.1.21.0 grewpy_backend.0.6.2
python -m pip install grewpy==0.7.1
python -B scripts/experiments/probe-structural-search.py \
  --corpus ../oldtupicorpus \
  --output /tmp/structural-search-grew.json \
  --export /tmp/pydicate-grew-graphs.json \
  --grew
```

The adapter uses `Graph(graph_json)` and `Corpus({sent_id: graph})`, supported by
the inspected grewpy source. Explicit edge features `{slot: value}` avoid
interpreting `kw:definition` as a UD subtype. Nodes are unordered: child
positions are edges, not word order. The runner compares complete
`(expression ID, variable → node ID)` bindings, not just counts. Exit 0 with
`grew.status: passed` is the required evidence; it has not been obtained here.

Example generated request, intended to find the four historical constructions
reported by the native baseline:

```grew
pattern {
  B [kind="method", method="base_nominal"];
  V [kind="method", method="var"];
  L [kind="literal", literal="1"];
  B -[slot="receiver"]-> V;
  V -[slot="arg0"]-> L;
}
```

An exclusion with a significant scope distinction:

```grew
pattern { M [kind="method", method="imp"]; }
without {
  N [kind="unary", op="-"];
  M ->> N;
}
```

This excludes a minus operation *inside* the imperative but permits an outer
minus that contains it. Do not label this "affirmative imperative" without
additional semantic analysis.

## Findings from GitHub

Inspected revisions:

- [grewlib](https://github.com/grew-nlp/grewlib/tree/e2386781e484869af28bba7881fb41cc53b6e2fa)
- [grewpy](https://github.com/grew-nlp/grewpy/tree/be24efc46dd5673db78279e0d4478c9244c20d88)
- [grewpy_backend](https://github.com/grew-nlp/grewpy_backend/tree/063678c6ff2c679cbb7eca01975a675a8cf1ba3a)

In `grewlib/src/grew_rule.ml`, `Matching.extend_matching` recursively extends a
partial binding. It follows outgoing graph edges when the source is bound,
tests labels and node features, rejects reused nodes when injectivity is
required, and explores alternatives. Remaining constraints are tested after
the mandatory pattern is complete. `search_request_in_graph` then filters
bindings using required or forbidden extensions. In `src/grew_corpus.ml`,
`Corpus.search` visits graphs and collects or groups their matches.

This is constrained graph matching, not a learned analyser. The useful reusable
asset is its established query language and semantics: feature comparisons,
exclusions, paths and grouping. The [request language](https://grew.fr/doc/request/)
is much wider than the deliberately small native baseline.

`grewpy/network.py` starts a separate OCaml backend and exchanges JSON over a
local socket. The inspected bounded-search backend drops completion status from
its response, and library timeout checks occur after a graph's matches are
computed. Product integration needs a host deadline/cancellation boundary and
must not present bounded results as exact totals.

The repositories include CeCILL licences; grewlib declares CECILL-2.1. Dependency
integration and copying/modifying code require a deliberate licence choice.
This probe contains its own small baseline, not translated Grew source.

The official [grew_match_quick](https://github.com/grew-nlp/grew_match_quick)
launcher provides a standalone web demonstration. Its documented quick corpus
path expects CoNLL/CoNLL-U and UD/SUD configuration; it is not a drop-in loader
for this custom JSON export. Direct grewpy integration avoids that detour.

## Keep linguistic meaning attached to evidence

| Graph view | Existing source of truth | Useful queries |
| --- | --- | --- |
| Authored construction | `studio_authoring.expression_tree` | Explicit scope, child positions, operations and editable addresses |
| Evaluated predicate | `authoring_runtime.shape`, `runtimeTree`, step evaluation | Runtime types, overload dispatch and exposed argument roles |
| Realized morphology | Engine annotations and `morphemes` | Person, tags and allomorphs actually generated |

Start with the authored view. Add runtime features with engine fingerprints and
explicit availability states. Reuse `operation-terms.ts`'s evidence-based labels:
`*` alone does not identify subject, object or possessor. `.circ(False)` also
shows why an explicit method name is not necessarily the resulting feature.

Composite names and helpers remain opaque beyond their explicit arguments.
Searching inside them needs a separate bounded expansion view, declaration
identity and provenance. An absent source operation need not be absent from an
evaluated construction. Unknown Python syntax remains an opaque source node.
Morphemes must not be assigned to AST nodes without verified alignment.

## Focused Studio implementation assignment

Extend the hidden lab in [the parser plan](tupi-parser-lab-implementation.md):

1. After actual Grew parity passes, extract the exporter into a small read-only
   module. Retain revision, source node ID, UTF-16 span, graph-view version and
   source identity. Replace this probe's source/ordinal IDs with Studio's
   reconciled passage identities. Keep current drafts, saved sources and reviewed
   references distinguishable. Add engine identity for runtime features.
2. Add structural search behind the existing Python worker/IPC, using a shared
   query/result schema for the visual builder subset. Compile it to Grew requests.
   Advanced raw Grew queries remain engine-specific. Keep Grew optional until
   packaging is demonstrated; never silently substitute a limited native matcher
   for arbitrary Grew requests.
3. Cache graphs by source/draft revision and adapter/engine fingerprint. Update
   only changed entries. Bound work and results; expose incomplete/cancelled
   searches. Check revisions before highlighting a current source occurrence.
4. Add saved examples and **Search by selected structure** to the hidden lab.
   Reuse ExpressionCanvas selection and operation labels. Support fixed operation,
   fixed lexical item/wildcard, direct child/descendant, child position and
   exclusion. Show the generated query. Results open and highlight nodes in the
   existing passage/tree; do not introduce another tree editor.
5. Use query results for retrieval, training-data selection, coverage audits and
   contrast sets. Mark synthetic data separately; matches confer no editorial
   approval. Keep evaluation examples and templates outside training retrieval.
6. Gate the first slice on identical Grew/native bindings for all 11 queries,
   changed-draft/stale-result handling, repeated occurrences, opaque-helper
   disclosure, unchanged source files, and an actual desktop search → result →
   existing-tree-highlight interaction. Benchmark larger exports when the intended
   corpus scale makes that necessary.

Then choose on evidence: Grew if its richer language/grouping justify the OCaml
backend; a narrow native implementation if the actual visual query requirements
remain small and portable packaging dominates. Both reuse the adapter, source
mapping, query fixtures, results UI and corpus selection work.

Structural search helps retrieve analysed examples and audit coverage. It does
not itself infer Pydicate from raw Tupi, correct OCR, rank ambiguous parses or
generate morphology. Those remain the grammar and inverse-pipeline milestones.
