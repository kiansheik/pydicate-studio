# Structural search research handoff

## Goal and decision

Test whether existing Pydicate structures can support Grew-style search and
compare using Grew inside Studio with adapting the technique. Preserve the
grammar, editor and source representations. The proposed first integration is
a custom-graph adapter plus an optional grewpy backend, using the current UI.
No UD conversion or copied Grew implementation is required.

## Inspected and changed

Inspected Studio agent guides, source adapter, rendered reuse search, runtime
shape/evaluation and operation labels. Inspected upstream grewlib matching and
corpus functions, grewpy graph/request/corpus/network modules, grewpy_backend
search protocol, licences and grew_match_quick documentation. Exact upstream
commits are recorded in the design document.

Added `scripts/experiments/probe-structural-search.py`,
`docs/evaluation/structural-search-probe.json` and
`docs/design/pydicate-structural-search.md`. Linked the research from the parser
implementation plan; updated agent state/log and this handoff. No product code,
package dependencies, sibling repositories or generated corpus files changed.

## Commands and evidence

```sh
python -B scripts/experiments/probe-structural-search.py \
  --corpus /path/to/oldtupicorpus \
  --output docs/evaluation/structural-search-probe.json \
  --export /tmp/pydicate-grew-graphs.json \
  --grew
```

Selected corpus commit `292a28722a1790abf3f3b93083c29fbd47b4ffd0`.
Exit **2**, intentionally reporting unavailable Grew after successful native
checks. Exported 122 historical expressions / 1,895 nodes; 11 query suites over
14 control expressions passed; 1,964 UTF-16 source spans verified; input hashes
unchanged. Full exported graphs are regenerable and are not duplicated in Git.
The committed report contains request strings, counts, source-bound examples,
fingerprints and native timings.

The environment lacked opam, OCaml and grewpy_backend. `apt-get update` failed
on user/group switching permissions; no privilege escalation was requested.
Upstream source clones succeeded. Actual Grew execution, comparative timings,
desktop packaging and native UI gestures are **not verified**. The optional
Grew runner was checked against upstream APIs by inspection, not execution.

Narrow validation: native probe, fixture assertions, source-span/hash checks,
Python syntax compilation, JSON invariants, local Markdown link checks and
`git diff --check`. Product builds/tests are not relevant to these research-only
changes and were not run.

## Remaining limits and next prompt

Source AST operations are not automatically linguistic roles. Helpers and
composite aliases need explicit, provenance-preserving expansion; runtime
features and morpheme alignment require independent evidence. Counts describe
this public checkout, not a newer private working corpus. Grew backend bounds
need host cancellation and explicit partial-result semantics before UI use.

Suggested next prompt: follow the comparison commands in
`docs/design/pydicate-structural-search.md` on a machine with the actual Grew
backend. Resolve any adapter/query mismatch and require identical bindings for
all 11 queries. Then implement the first hidden Studio structural-search slice
using the current source tree, passage identities and highlighting, with Grew
optional until packaging is demonstrated. Keep the normalized-Tupi inverse
pipeline from `tupi-parser-lab-implementation.md` as its own milestone.
