# Real-data authoring evaluation set

## Goal

Prepare a reproducible, unrun Araújo authoring evaluation with separate reconstruction and assisted-reuse arms, withheld answers, explicit evidence limitations and no inference usage. Repair stale corpus-copy test assumptions after the selected source grew to86 passages.

## Files inspected

Required agent docs and current AI contract; `docs/coverage/araujo.json`; selected Araújo source, shared lexicon and saved reference identities; adapter snapshots, authoring runtime, rendered-structure index, source-span and preview/approval implementation; `python/tests/test_authoring.py`.

## Files changed

- `scripts/build-authoring-eval.py` and `python/tests/test_authoring_eval_set.py`.
- `docs/evaluation/README.md` and five files under `docs/evaluation/araujo-authoring-v1/`, including a separately labelled evaluator-only answer key.
- `package.json`: `eval:authoring:build` command only; no new evaluation dependencies.
- `python/tests/test_authoring.py`: dynamic append count, explicit disposable sequential-approval gap, and precise allowance for intentionally replaced adjacent note directives.

## Commands run

- `python3 -B scripts/build-authoring-eval.py`:86 rows,6 reconstruction cases,6 assisted cases,1122 reuse-index entries; source/lexicon/saved-reference/dictionary hashes and selected repository fingerprints unchanged; zero provider requests.
- Same generator into a temporary directory: all **five artifacts byte-identical**.
- `python3 -B -m unittest discover -s python/tests -p test_authoring_eval_set.py -v`: **4/4 pass**, including duplicate answers, merged-origin constructions, equivalent aliases and transitive composite leakage controls.
- `python3 -B -m unittest python.tests.test_authoring.CorpusCopyTests.test_new_line_and_new_lexical_provenance_review_loop python.tests.test_authoring.CorpusCopyTests.test_reference_approval_requires_explicit_surface_and_sequential_authority python.tests.test_authoring.CorpusCopyTests.test_all_araujo_scope_edit_previews_preserve_unrelated_source_bytes -v`: **3/3 pass**, including all86 scope-preview subcases, in19.224 seconds.
- `git diff --check` and targeted package formatting.

## What worked

Cases83,85 and86 preserve actual source diplomatic directives; cases2,67 and81 explicitly use known modern output and claim no historic transcription accuracy. Reconstruction excludes target/duplicate IDs, target-derived subtrees and named/transitive equivalents. Raw expressions, evaluations, canvas, feedback, history and hidden-answer context stay out of public input. Assisted reuse intentionally allows existing source constructions and is labelled separately. No legacy saved status is silently promoted to reviewed preceding context. Dataset/checksum identities, fold modes and a multidimensional human rubric remain explicit.

## What failed and was fixed

The first generator attempt used plain expression parsing on concretely indented multiline source; it now uses the existing authoring parser. The corpus-copy failures were fixture assumptions: append expected83, approval assumed82 was beyond the saved frontier, and scope-prefix checks treated existing replaceable Studio notes as immutable. The corrected tests retain sequential authority, unchanged unrelated bytes, expression structure and stable passage identity. No production change was needed.

## Remaining questions

All model outcomes remain **not run**; no linguistic usefulness is established. The underlying reuse collector reports existing partial-node diagnostics for passages77 and85; these are recorded in provenance, and complete target passage IDs are still denied. Source84 is omitted because its diplomatic input and current output need human assessment. Live execution must capture these templates through the normal isolated queue, remapping provisional IDs and recomputing its actual digest, not insert template records directly. The evaluator key must never be registered as agent input/MCP material; scoped providers must retain no filesystem or shell access.

## Suggested next prompt

Authorize a small explicit live budget for one reconstruction and one assisted-reuse case in separate conversations, then record evidence quality, structure/morphemes, residual errors, human corrections, tool failures and usage without treating output equality as approval.
