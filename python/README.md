# Python authoring service

Python 3.10+ and Git are required. The desktop worker runs the selected local `oldtupicorpus` and `nhe-enga` pair; language realization remains in that engine. No new Python packages are needed for the observed Araújo evaluation path. The actual dirty dependencies and Python runtime are recorded in [next-baseline.json](../docs/design/next-baseline.json), with the exact seven changed dependency files preserved by [binary patches](../docs/design/dependency-patches/) and a local relevant-file archive under `.local/dependencies/`.

Run the service with `python3 -B python/worker.py --state-dir /path/to/studio-state`. Test with `python3 -B -m unittest discover -s python/tests -v`. Re-run the read-only full source audit with `python3 -B python/audit_araujo.py --parent /path/containing/both/clones`; it discovers the expression count and writes `docs/coverage/araujo.json` and `araujo.md`.

The protocol is one JSON object per line: `{ "id": 1, "method": "open_project", "params": { "parentPath": "/path/containing/both/clones" } }`; output is `{id,result}` or `{id,error:{message,code}}`. The desktop owns filesystem authorization and supplies the state directory. All following operations require an open project except syntax parsing.

| Method | Parameters / behavior |
|---|---|
| `open_project`, `refresh_project` | Read source, original records, selected revisions and content fingerprints. Araújo is the active milestone; Bettendorff is excluded. |
| `parse_expression` | `{raw,revisionId}` → exact raw, recursive construction cards, UTF-16 spans, diagnostics and separate capabilities. Invalid text stays invalid and recoverable. |
| `evaluate_expression` | `{passageId,raw,revisionId,engineFingerprint}` → actual surface, annotations, morphemes, runtime-enriched construction cards and a structural fingerprint. |
| `lexicon_search`, `lexicon_inspect` | `{query,limit?,passageId?}` / `{name,passageId?}` → runtime class and definition, original declaration, transitive affected uses, stable lexical ID and provenance. Helpers expose their signature, return template and prerequisite statements. |
| `lexicon_create` | `{headword,definition,category,scope,provenance?,passageId?}` → a reviewed source/shared-definition preview. Identifiers are deterministic, valid Python and checked for collisions. Reusing the same proposal returns its existing identifier. |
| `lexicon_update` | `{name,definition,scope,passageId}` → source/shared preview with affected uses, or an occurrence-only copied candidate. Existing names and IDs survive gloss changes. |
| `dictionary_search` | `{query,limit?}` → actual Navarro resources; dictionary senses remain distinct from project entries. |
| `source_preview` | `{passageId,raw?,metadata?}` → concrete unified diff, preview ID, source fingerprint and stable target passage ID. A no-op returns an empty diff and byte-identical source. |
| `source_new_preview` | `{raw,metadata?,sourceId?,newPassageId?}` → new Araújo entry with a source-adjacent stable ID. A reserved canonical `passage:UUID` may carry a validated matching PDF evidence pointer; explicit printed page/folio/line remain separate from physical PDF coordinates. |
| `source_apply` | `{previewId,sourceFingerprint}` → applies only that reviewed diff, checks source and dependency freshness, preserves recovery material, atomically replaces source, and returns a refreshed project. |
| `source_recovery_list` | `{}` → saved recovery summaries for the selected corpus, current recoverability and timestamps, without source byte payloads. |
| `source_recover` | `{recoveryId}` → a new preview restoring prior bytes; refuses if the file has since changed. Recovery itself still requires explicit apply. |
| `reference_verify` | `{passageId}` → selected corpus's authoritative verification service; does not approve. |
| `reference_approve` | `{passageId,sourceFingerprint,reviewedSurface}` → explicit surface check and upstream `commit_ground_truth`, retaining its sequential constraints and declared-target protection with an atomic persistence sink and review recovery event. |
| `assistant_context` | `{passageId,raw?}` → neighbors, original/edited text, lexical definitions, evidence and exact versions. Incomplete syntax includes a diagnostic and original lexical context. |
| `contribution_prepare` | `{draft?}` → reviewable Git binary patch for staged/unstaged/new source and reference files, with versions and draft. It does not create a commit or publish. |

`render` still accepts the original strict fixed-model request for backward compatibility. Browser examples remain examples; they do not stand in for live engine execution.

## Source and engine fidelity

`studio_authoring.py` uses the AST to locate structure and original tokens to retain concrete source spans. It never pretty-prints the whole file. Collection elements are parsed with synthetic outer parentheses because Python lists supply implicit continuation; those synthetic characters never enter stored raw text or UTF-16 offsets. Visual replacements wrap the chosen span, retaining associativity. A future unknown construct retains its raw source and reports an adapter capability gap.

`authoring_runtime.py` is a fresh process per request. It imports the trusted selected lexicon and applies source-local definitions and `.definition` mutations preceding the selected entry in source execution order. Contributor candidates use a bounded AST interpreter with allowed Pydicate constructors, helpers, methods and operators; they cannot import modules, access private attributes, open files or execute arbitrary statements. The trusted local engine and lexicon themselves are normal Python, not a security sandbox for untrusted repositories.

Runtime cards contain actual operand types and dispatch implementations. Subject/object summaries come from the engine's `Verb.subject()` / `Verb.object()` and its single-object transitive rule, rather than operator characters. These roles describe each construction at that scope. A morpheme's tag comes from `eval(annotated=True)`; token alignment to internal syntax is intentionally left unspecified. The audit compares full runtime grammatical structure, not only rendered surfaces.

Named compounds remain references unless the user explicitly chooses a copied occurrence. Parameterized helper templates are inspectable separately from their evaluated call. Multi-statement helper prerequisites such as `v`'s class inference are shown as source context; template display does not claim that every helper implementation statement is visually editable.

## Metadata, identities and persistence

Original `# @...` comments and inherited page/section/subsection metadata use the selected corpus's authoritative parser. Unknown directives are not invented: the upstream parser rejects them. Studio adds its versioned extension only within a supported note on explicit reviewed application:

```python
# @note studio:v1 {"passageId":"passage:uuid","evidence":{"version":1,"assetId":"sha256","passageId":"passage:uuid"}}
l += (...)
```

All other scholarly metadata continues using upstream `@diplomatic`, `@target`, `@translation`, `@note`, and locator directives. Metadata comments do not grant a new Studio editorial approval. The existing JSONL references retain their legacy provenance until the explicit authoritative approval workflow is invoked.

Before a passage acquires a source ID, Studio's sidecar records expression sequences. Unchanged sequences, stationary duplicates, and unambiguous insertion/deletion alignments retain IDs across restarts. An ambiguous insertion of an identical unmarked expression receives new IDs so prior drafts cannot silently attach to another occurrence. Source-adjacent IDs survive expression correction and reordering; duplicated explicit IDs are diagnosed. Orphan reassociation remains an explicit user review.

Preview/apply preserves unrelated bytes. Repeated identical metadata application is a no-op; changing notes replaces the edited adjacent human directives without appending duplicates. Explicit empty scholarly directives clear imported fields without resurrecting older JSONL metadata; the accepted reference is retained independently. Draft conflict fingerprints include authoritative human metadata, excluding machine IDs and physical line movement. New local definitions are inserted before the source collection; a source-local gloss override is inserted before its first affected construction. Occurrence-only gloss copies use a small `studio_define` helper included explicitly in the preview, so exported source executes outside Studio. Before replacement the service writes the exact prior bytes and expected replacement fingerprint under state `recovery/`, flushes a temporary file and uses atomic replacement. A failure preserves either the original source or the applied source plus recovery evidence.

The upstream annotation parser binds comments immediately before an expression's first AST token. When an explicitly edited collection expression starts with opening parentheses on earlier lines, the reviewed diff joins only that whitespace prefix onto the first token's line, preserving its AST and every comment. For example, `(\n    (-(a + b))\n)` becomes `((-(a + b))\n)`, allowing metadata before the physical opening line to reimport correctly. This adjustment is limited to the edited expression; untouched source remains byte exact and repeated application is a no-op. A prefix containing comments is preserved with a `SOURCE_METADATA_ANCHOR` diagnostic requiring manual review.

Relevant tracked/nonignored untracked contents, HEAD and interpreter/adapter identity contribute to fingerprints. File changes during evaluation are rejected. The complete corpus import and all actual-source source writes are exercised only in disposable copies by the integration tests; the user's historical corpus is not modified by tests.
