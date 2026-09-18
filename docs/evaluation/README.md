# Araújo authoring evaluation

This is a small, reproducible **unrun** evaluation set, separate from protocol fixtures. It does not establish model linguistic usefulness. No provider request was made to build it.

Generate against the exact selected checkouts:

```sh
npm run audit:araujo
npm run eval:authoring:build
python3 -B -m unittest discover -s python/tests -p test_authoring_eval_set.py -v
```

`scripts/build-authoring-eval.py` also accepts `--parent`, `--coverage`, `--output` and explicit `--ordinals`. It refuses a stale source/dependency audit. It reads the actual source, shared lexicon, saved references and compressed Navarro website dictionary. It uses the existing selected-engine reuse-index implementation, restricted to Araújo and its shared lexicon; it does not import Bettendorf. Before/after hashes and repository fingerprints must agree. It writes only evaluation artifacts under Studio.

The recorded checkout has **86 passages**. Six cases appear in each arm: 2, 67, 81, 83, 85 and 86. Cases83/85/86 contain their actual `@diplomatic` directives; case85 preserves `Nhemombëú.` and case86 preserves `Acé rëõ ianondé nhándy caräîba râra.`. Cases2/67/81 use audited modern engine surfaces as explicitly labelled **known-modern-text reconstruction**. Their diplomatic field is empty. They are not historical transcriptions or evidence of historical reading accuracy.

The selected source annotations and saved baselines can contain errors. A passing engine audit proves realization parity, not historical or linguistic correctness. In particular, source84 is not a benchmark case: its supplied diplomatic reading and current generated surface differ substantially and need human source assessment first.

## Arms and withheld material

- [Reconstruction cases](araujo-authoring-v1/reconstruction.jsonl): build an analysis from the preserved input without the original Pydicate answer. No expression, evaluation, graph, canvas, feedback, prior messages or answer-derived construction details are supplied. Target and duplicate answer identities, target subtree IDs, equivalent named aliases and transitive composites are denied by the manifest.
- [Assisted reuse cases](araujo-authoring-v1/assisted.jsonl): same textual inputs and budgets, but existing source/lexicon structures are available. This measures discovery, namespace validation and contributor reuse, **not autonomous reconstruction**.
- [Provenance](araujo-authoring-v1/provenance.json): exact corpus/dependency/dictionary hashes, index identity,86-row audit identity and before/after verification.
- [Results template](araujo-authoring-v1/results-template.json): all12 runs start `not-run`, with zero requests and no editorial approval.

`evaluator-only/answers.json` is a separate, withheld human evaluation key. **Never attach it, register it as reference material, load it into a provider conversation, or expose it through MCP.** It contains current baseline expressions, actual annotations and comparison surfaces. Its presence in the repository is safe only under the Studio tool restriction: a model must not have filesystem/shell access or unrestricted repository retrieval. Use a fresh provider conversation for each case; previous assisted runs must not seed reconstruction.

The public input files are frozen evaluation templates, not mutable queue database records. Their versioned, sorted-JSON `sha256:` digest identifies the template. A live run must resolve the recorded ordinal/fingerprints against its isolated profile, remap provisional passage IDs if needed, and capture the queue's normal input/digest with provider configuration. Do not manually insert templates into a live user's state file. Explicit source IDs85/86 remain stable; earlier profile-specific/provisional IDs are identified in the evaluator key.

No preceding passage is silently certified as human-reviewed from legacy `status:approved` records. These cases deliberately supply an empty preceding-context list and explain why. The allowed research manifest contains only Araújo, shared lexicon and the exact Navarro website dataset. Retrieved constructions keep their source provenance and remain subject to review. Dictionary row indexes/checksums are not SQLite verb IDs. No PDF pixels were supplied.

## Human assessment rubric

Record observations and evidence, not an invented certainty percentage. Keep each dimension separate:

| Dimension | Record |
|---|---|
| Evidence quality | Exact dictionary dataset/row/sense, complete definition/examples consulted, source citations, and whether each claim is attested, supported only by a saved analysis, or still a hypothesis. |
| Structural support | Current candidate revision/engine, inspectable source graph, scope/argument ordering, supported role annotations, reused-construction references, and unsupported operations/opaque shortcuts. |
| Morpheme coverage | Each explained source portion and corresponding generated morphemes/nodes; many-to-many links are allowed. Keep unresolved portions and inferred omissions visible. |
| Surface comparison | Exact equality, spacing/case-folded equality and additionally accent-folded equality separately. Preserve both original forms and every nasalization/accent mismatch. No punctuation, hyphen or other distinction is erased implicitly. |
| Residual mismatch | Unexplained source text, wrong sense/role/scope, partial engine failures and differences from the evaluator baseline. A better supported alternative can be preferable to exact baseline agreement. |
| Human correction | Candidate/node revision, what the contributor changed, why, and whether another sense or structure remained viable. |
| Tool reliability | Tool name/operation ID, structured failure, retries, unavailable evidence, stale revisions, cancellation and recovery. |
| Resources | Provider/model, attempts, input/output tokens when reported, tool calls, elapsed time and ambiguous billed acknowledgements. |

A desired output obtained from a whole-phrase literal or unsupported opaque constructor is **not linguistically established**. Conversely, a partial analysis with justified senses, useful morphemes and a focused question is a useful outcome. Never turn output equality, a proposed candidate, draft acceptance or source publication into editorial approval.

A live-provider experiment requires a separately initiated explicit budget. Start with one reconstruction and one assisted case, maintain separate conversations, retain every competing candidate and complete this rubric before expanding. Current checked-in results remain **unrun**.
