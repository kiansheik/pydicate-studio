# Pydicate Studio

## Design decision

Build a separate desktop application, provisionally `pydicate-studio`, around the existing Pydicate engine and Old Tupi corpus authoring services. Its primary document is a passage under analysis. Its primary actions are reading, describing, comparing, explaining, and reviewing.

Use a structured phrase editor: contributors select a word or constituent, identify its participants and relations, and apply named linguistic operations. The software maintains the corresponding Pydicate expression. A visual tree, morpheme view, translation, source page, and optional code view are projections of the same analysis.

The critical product requirement is that a colleague can make a useful, reviewable contribution before they can encode an entire sentence or understand Python. A transcription, corrected reading, alternative attachment, or explanation of a grammatical rule must be independently saveable.

This is a proposed design, not an implemented application. Repository observations below are distinguished from proposed additions. No source, grammar, ground truth, or remote Git state was changed during this investigation.

## Evidence inspected

The review covered source files, implementations, agent instructions, current-state notes, session handoffs, recent commit history, and the active authoring branches. It included a static inventory of the historic `.tu.py` files and lexicon, selected direct renders, and an attempted corpus test run.

| Repository | Revision examined | Why this revision matters |
|---|---|---|
| `kiansheik/nhe-enga` | `main`, `348686045bf0791c847be3cba1b15eaae7312a11` | Current published morphology/Pydicate implementation, including September 16 nominal changes. |
| `kiansheik/oldtupicorpus` | `agent-authoring-mcp-framework`, `c59f303f1aa6143e43806f27d30703206a846958` | September 16 authoring, single-line approval, engine reload, source metadata, and grammar-fix notes. `main` remains at the June 28 snapshot. |
| `kiansheik/vscodetupy` | `agent-authoring-mcp-framework`, `d287b17edbfd63483e3d20ec40d372ed629fa1a8` | Latest correction prompt and inline ground-truth controls. `main` remains at the June 28 snapshot. |

The published corpus branch contains **82 Araújo expressions and 40 Bettendorff expressions**, with **80 and 40 saved records**, respectively. Those are inventory counts, not a claim that the full corpus passes against the fetched engine. None of those 120 saved records currently supplies an explicit `normalized_target`; their saved `surface` is the reference used for comparison.

The corpus test command `python3 tests/run_tests.py --skip-tokenizer` stops during import: Araújo uses `n(opakombó)`, but the fetched `Number` class has no `base_nominal` method. The September 16 handoff describes this exact fix as completed locally. The published cross-repository combination therefore does not reproduce the whole logged local state. The first implementation milestone must establish a compatible snapshot; this investigation does not claim access to unpushed files on Kian's machine.

Selected expressions could be evaluated directly through the lexicon:

| Expression | Observed rendering |
|---|---|
| `orébe` | `orébe` |
| `og * apixara` | `oapixara` |
| `nde * apixara` | `nde rapixara` |
| `apixara` | `tapixara` |
| `-(+nde * apiti * moro).imp()` | `eporoapiti umẽ` |
| Araújo 0074's unchanged expression | `oîeaûsuba îabé asé oapixararaûsuba no` |

The current saved imperative example is **Araújo 0067**, although an earlier conversation referred to it as 0066. IDs are presently based on position; they are not durable identities when material is inserted earlier. Durable passage IDs are a collaboration prerequisite.

## What the existing workflow has already established

The March history introduces inline lookup, scoped rendering, and ground-truth iteration. The June authoring work establishes human authority over readings and analyses, candidate rendering before application, source-adjacent metadata, and read-only MCP tools. The September work adds a deliberately focused grammar-repair prompt, per-line approval, and explicit engine reload after changes.

The successful loop is:

1. Inspect the source and nearby text.
2. Reuse lexical entries and precedents.
3. Compose an analysis and inspect intermediate renderings.
4. Distinguish an incorrect analysis from an incorrect implementation of an accepted analysis.
5. Describe the expected form and grammatical reason.
6. Review a diagnosed engine correction once, then let the agent implement and verify it.
7. Inspect the result and approve that line explicitly.
8. Preserve the example as a regression and the explanation as reusable knowledge.

Preserve this loop. The application should absorb the Python, terminal, clipboard, environment, and Git mechanics that currently surround it.

## Product model: one passage, several kinds of evidence

Keep these objects distinct in both storage and interface:

| Object | What it means | Who can establish it |
|---|---|---|
| Source witness and page region | The documentary evidence, including edition and locator | Contributor, then reviewer |
| Diplomatic transcription | What is read in that witness, preserving original spelling and uncertainty | Human editorial judgment |
| Normalized reading | The chosen normalized representation of that reading | Human editorial judgment |
| Linguistic analysis | Lexical senses, relations, scope, derivations, and references | Human proposal/review, optionally AI-assisted |
| Generated form | What a specific engine and analysis produce | Deterministic engine execution |
| Translation | A source translation, human interpretation, or AI suggestion, with its origin retained | Origin-specific; suggestions require review |
| Accepted reference | The expected result established by a particular editorial decision | Explicit human acceptance |
| Verification | Whether the current implementation agrees with that reference | Test result tied to exact versions |

A matching surface does not prove the analysis. A line can match its reference while still having unresolved scope or disputed interpretation. The current green marker largely represents equality with a saved record; the studio should distinguish **render agreement**, **editorial review**, and **version freshness**.

Do not treat a printed page number as a PDF page index. Store their mapping, witness identity, scan identity, and optional page rectangle explicitly. A passage may span multiple lines/pages; two witnesses can have different readings and alignments.

## Interface and interaction

### The reading desk

At desktop width, use a narrow passage navigator, a source/reference pane, and a dominant analysis workspace. Keep the agent in a contextual drawer that opens for an actual task. On smaller screens, alternate source and analysis while retaining the selected passage and constituent.

The passage navigator shows document sections, neighboring readings, and plain-language states: `Por transcrever`, `Em análise`, `Precisa de revisão`, `Aprovado`, `Resultado mudou`. It should support a queue of assigned passages and unfinished contributions. It is not a filesystem tree.

The source pane contains the PDF or page image, zoom and page movement, witness/edition, locator, diplomatic text, and normalized reading. Clicking a passage restores its source region. PAGE XML/Transkribus geometry can supply regions where available; existing PDF viewing by itself does not imply those mappings already exist.

At the top of the analysis workspace, keep the accepted reading and current generated result visible. Highlight changed spans with text explanations as well as color. Beneath them, expose `Construção`, `Morfemas`, `Árvore`, `Tradução`, and `Histórico`. Optional `Código` is available to maintainers.

The application should support three entry paths without asking users to choose a professional role:

- **Contribuir uma leitura:** transcribe, translate, locate, flag uncertainty, or describe a correction. No complete formal analysis required.
- **Montar a análise:** compose and revise the structure visually.
- **Revisar:** compare evidence, alternatives, generated output, and consequences; accept or return for revision.

### The sentence editor

Use recursive phrase cards with named slots. An event exposes its predicate and participants. A nominal phrase exposes its head, possessor, modifiers, and derivational layers. A subordinate clause can fill a slot just as a lexical item can. Advanced terms appear beside accessible questions, such as `Quem realiza? · sujeito` and `A quem se refere? · referente`.

Do not force all Tupi predications into a subject–verb–object template. Stative predication, zero copulas, nominal predicates, referential prefixes, and nominalized clauses must be first-class constructions. Linguistic roles and their surface realization are separate settings. An unexpressed participant remains present in the analysis.

Selecting a constituent should simultaneously select its phrase card, tree node(s), morpheme contributions, and optional source expression. Display the selected constituent's own generated form, preserving the useful experience of moving across nested closing parentheses in the current extension.

Provide explicit actions such as `Adicionar participante`, `Adicionar modificador`, `Possuir`, `Nominalizar`, `Negar esta parte`, `Subordinar`, `Coordenar`, and `Escolher variante`. Offer only applicable operations, but explain unavailable ones. Optional dragging can supplement these actions; it cannot be the only way to compose or reorder.

Scope needs to remain visible. Applying negation to a derivation versus to its internal predicate must produce different visible nesting even where their current surface outputs coincide. Moving a constituent in surface order must not silently reattach it syntactically.

### Two representative interactions

**Araújo 0067, `eporoapiti umẽ`:** the contributor sees `apiti`, an understood second-person participant, a generic human object, imperative mood, and negation. Choosing `Negar esta oração` corresponds to the outer negation in `-(+nde * apiti * moro).imp()`. Selecting the generic object highlights `poro`; selecting negation highlights `umẽ`. A simple explanation states what each contributes. The Python expression is available but unnecessary to operate the editor.

**Araújo 0074, the `og * apixara` correction:** the contributor can say that the noun refers to the main-clause subject and that the unwanted absolute prefix should not occur. The application attaches that explanation to the selected nominal constituent, its parent clause, the expected form, and contrast examples. The repair view shows the proposed grammatical behavior and contrasts such as `nde rapixara` and standalone `tapixara`, not merely a code patch. These examples come from the existing September 16 note.

### A surface word is not a syntax node

`orébe` stays one visible surface word. Expanding it can expose the underlying `oré * supé` relation and the selected realization variant. Word boundaries, realized morphemes, lexical entries, syntactic constituents, and token-registry IDs are separate layers.

Alignment must be many-to-many: one word can realize several nodes, a node can contribute discontinuous material, and an unexpressed participant may have no surface span. The current dictionary syntax-span builder skips noncontiguous spans, so it is useful display groundwork rather than a complete editor alignment model.

## Coverage of the actual Pydicate language

The inventory found nine operator forms in the historic source expressions, plus calls, macros, aliases, constructor metadata, and direct definition updates. Implement the following coverage matrix before claiming that the studio replaces hand authoring.

| Existing construct | Linguist-facing control | What must survive editing |
|---|---|---|
| `Noun`, `Verb`, `ProperNoun`, `Adverb`, `Postposition`, `Number`, `Particle`, `Interjection`, `Demonstrative`, `Conjunction` | Search/create lexical entry; choose sense and category | Lemma, sense, class, features, tags, and source identity |
| `*` | Participant, possessor, complement, or derivation slot, according to operand types | Operand direction and exact category-specific meaning |
| Binary `+` | Add modifier or coordinate compatible nominal material | Attachment, operation type, and pre/post ordering |
| Unary `+` | Keep participant understood, omit its independent realization | Reference and person remain in the analysis |
| Unary `-` | Negate selected constituent | Scope and nesting |
| `/` | Compose stems/derived forms | Operand order and derivation/composition order |
| `==`, `@`, `cop()` | Predication/apposition construction as supported by the classes | Full operands and any implicit verbal nominalization |
| `<<`, `>>` | Link dependent clause; choose attachment and position | Principal relation, argument reference, ordering, special adverb attachment behavior |
| `.imp()`, `.perm()`, `.circ(False/True)` | Mood and circumstantial realization controls | Explicit override versus engine inference |
| `.voc()` | Address someone/something | Vocative scope |
| `.redup()` | Reduplicate selected predicate | Operation and location in the derivation chain |
| `.var(n)` | Choose among rendered variants with descriptions | Actual variant identity, not just a prettified label |
| `.base_nominal(...)`, `n(...)`, `v(...)` | Nominalize or form a stative predicate | Operation, arguments, annotations, and category transition |
| `sara`, `pyra`, `saba`, `emi`, `bae`, `rama`, `pûera`, `nduara` | Named derivation layers with before/after previews | Arbitrary nesting and order, including outer temporal layers |
| `îe`, `îo`, `og`, pronoun/person forms | Reflexive, reciprocal, and referential links | Explicit referents, including distinction from overt form |
| `.card()` and number expressions | Numeral construction controls | Numeral type and nominal behavior |
| `saguera`, `saguama`, `credo`, `pyreramo`, `n` lambdas | Reusable construction templates with parameters | Template identity, argument binding, and expansion |
| Aliases and compound definitions such as `jatf`, `ttomtmetkbae`, `orébe` | Reuse named phrase; expand for inspection | Shared definition versus local occurrence |
| `.definition = ...` within a source | Explicit lexical/contextual override | Execution order and whether the change applies locally or to a shared entry |
| `# @...` comments | Source and editorial forms | Adjacency, inheritance, and local versus inherited values |
| Unary `~`, other registered operations not observed in these historic lines | Capability-driven advanced operation | Supported engine semantics; no claim that it occurs in this corpus |

An operator is not a single UI button with a translated name. For example, `*` is overloaded across possession, verbal arguments, and derivation; `>>` has a special nonverbal-to-verbal attachment path. The Python engine owns those semantics.

Some class information is currently embedded in definition strings, including `(t)`, `(s)`, and `(m)`. The studio should expose those as grammatical fields while preserving their existing representation on write until the engine offers a structured replacement. A cosmetic gloss edit must not accidentally alter inflection class.

## The missing foundation: a lossless editable representation

Pydicate already has `compiler/ir.py` (`Atom`, `Op`, `MorphOp`, `Sugar`), a registry, pretty printing, and decompilation/search. Reuse and extend this machinery after coverage checks. Its existence does not establish that it round-trips every existing corpus expression or Python statement.

The first essential addition is an **authoring representation** that preserves the written analysis. It must carry operator order, named references, constructor arguments, method calls, derivation scope, macro calls, contextual overrides, source spans, and editorial metadata. Runtime predicate objects can erase construction history by rendering a derived form into a new noun; surface strings and token streams cannot reconstruct that history unambiguously.

Use a concrete-syntax-aware source adapter to preserve comments, formatting, imports, and untouched expressions. Parse the supported declarative subset, resolve known aliases and pure helper macros, and retain source mappings. Build the semantic view from this representation and typed engine information. Do not make the generated tokenizer DSL the editable authority: its documented reconstruction is best effort, with literal fallbacks.

For unfamiliar Python, preserve the original region and identify the missing capability. It may initially be inspectable but not visually editable. Such a fallback is useful for future extensions but **does not satisfy coverage of today's corpus**. Known current macros and definition mutations must receive explicit adapters before the release is declared complete.

The release gate is stronger than matching strings:

1. Import every existing historic expression and reachable lexical/helper definition.
2. Open and save without an edit; preserve untouched source bytes.
3. Export/reimport an edited construct; preserve its operations, roles, scope, order, lexical references, and source metadata.
4. Compare generated surfaces and structured annotations under the same pinned engine.
5. Check difficult examples where different analyses have the same surface.
6. Show every current construct through usable visual controls; code-only fallbacks do not count as full visual support.

The displayed syntax tree may be a tree, but the authoring model must also support shared lexical references and reference links. Keep occurrence IDs distinct from lexeme IDs and referent IDs.

## Identity, names, and predictable files

Hide variable naming from contributors. Definitions can suggest readable names, but do not use definition text alone as identity: glosses change, separate senses share a gloss, and the same lexeme can have multiple constructions or realization variants.

Use three distinct mechanisms:

- A persistent ID for each lexical sense, reusable construction, passage, and occurrence. Assign once and retain through label and gloss edits.
- A versioned semantic fingerprint for deduplication, caching, and change detection. Include language, lemma, category, sense/class features, and ordered structure as relevant. Normalize Unicode consistently while preserving meaningful diacritics; do not use accent-insensitive search normalization for identity.
- A readable Python binding allocated in a persistent registry. It can include a short fingerprint fragment for convenience, but compare full identities and check the namespace before allocating or importing. Resolve an actual collision explicitly; a truncated hash is not a mathematical guarantee.

Identical canonical definitions can be reused idempotently. Distinct senses remain distinct even if their generated text or glosses match. A gloss edit should not rename every reference across the corpus. Concurrent imports need deterministic conflict handling rather than opportunistic numeric suffixes based on local insertion order.

Add persistent passage IDs in a deliberate schema migration. Preserve current `source:ordinal` strings as legacy locators, and retain ordinals for reading order. Do not derive durable identity from the full expression, since correcting an expression must not sever its review history.

## Ground truth and approval

Keep `.tu.py` and adjacent editorial directives as the canonical analysis and editorial source. Keep generated corpus/tokenizer files derived. Store immutable review events separately, referring to an exact source revision, expression fingerprint, target/reference, engine fingerprint, and reviewer; these events are audit evidence, not an independently editable duplicate analysis.

The existing corpus has two behaviors that the new interface must make explicit:

- `commit_ground_truth` approves one record, protects a previously declared target, and requires contiguous approval order.
- Full regeneration re-derives the source records; records without explicit targets use generated surfaces, and annotation defaults can label them approved.

The studio must never treat regeneration as a new human approval. Preserve the accepted reference across grammar updates, show newly generated results as comparisons, and require an explicit reviewed operation for changing the reference. A migration can retain existing saved surfaces as accepted baselines, recording that their detailed reviewer provenance is legacy/unknown rather than inventing it. Carry explicit targets into source directives through a reviewed, inspectable migration if that becomes the canonical policy.

Persist human acceptance in the authoritative editorial workflow so rebuilding generated artifacts cannot lose or manufacture it. Amend the underlying schema/services accordingly; a UI label alone cannot fix this.

For the first pilot, retain sequential reference acceptance because the backend enforces it. Contributors can still save drafts and reviews out of order. Before larger parallel annotation, migrate to persistent IDs and per-record review events so unfinished earlier lines do not block later work.

Keep these user actions separate:

| Action | Meaning |
|---|---|
| `Salvar rascunho` | Retain incomplete work without declaring it correct. |
| `Aplicar proposta` | Apply an analysis change the user has reviewed. |
| `Verificar` | Compare a specific revision with existing references. |
| `Aprovar referência` | Establish a reviewed baseline for exactly this passage. |
| `Compartilhar contribuição` | Create/synchronize a reviewable contribution through Git. |

The current `Commit ground truth` action writes a record; it is not itself a Git commit. The new interface should not conflate those operations.

## AI assistance and grammar repair

Expose AI through contextual tasks: `Propor análise`, `Explicar esta forma`, `Sugerir tradução`, `Buscar exemplos`, and `Corrigir realização`. Use the selected constituent, source context, current target, lexical senses, and versioned analysis automatically. Chat history is available, but the work does not depend on a user composing a perfect prompt.

Use separate flows for three different corrections:

1. **Change the reading:** revise transcription/normalization with documentary evidence.
2. **Change the analysis:** propose a new structural interpretation and show its consequences.
3. **Fix realization:** preserve the approved analysis and ask why the engine fails to express it correctly.

The third flow directly carries forward the successful focused prompt. It includes the exact source expression, target, linguist explanation, selected scope, relevant precedents, grammar-navigation entries, and contrasts. The agent diagnoses before presenting one concrete checkpoint: proposed behavior, linguistic explanation, affected files, and anticipated scope. After approval it works through implementation, engine refresh, focused regressions, and all-source checks without repeated generic confirmations. It returns a reviewable result; approving a grammatical change does not authorize silently rewriting accepted readings.

Run engine changes in an isolated workspace containing a compatible corpus/engine pair. Record both repository revisions and relevant uncommitted content fingerprints. A multi-repository change is a bundle with a recovery journal; it is not an atomic Git commit across two repositories. Do not modify a contributor's unrelated working changes or auto-merge a grammar patch into the shared project.

The existing MCP tools are `list_sources`, `get_source_context`, `render_candidate`, `search_rendered_expressions`, `search_lexicon`, `verify_ground_truth`, `line_status`, and `reload_engine`. Preserve their read/evaluation role. Put mutation and final editorial acceptance behind explicit application commands with separate authority. An agent must not acquire approval rights simply because a tool is available.

Add draft-aware context retrieval: current `get_source_context` resolves the selected record from saved records, which is insufficient for a new unsaved passage. Candidate state needs revision IDs and independent context without first pretending the line is accepted.

Use **Codex App Server** for the first embedded provider because its documented purpose includes rich custom clients, streamed events, threads, and approval handling. Add **Claude Agent SDK** behind the same small adapter later. Use provider-supported authentication; the Claude SDK documentation currently directs third-party applications to API-key methods unless otherwise approved. Do not assume a contributor's consumer subscription automatically pays for an embedded integration. Normal visual editing and deterministic rendering must work without an AI request.

References: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Repository and application architecture

| Owner | Responsibility |
|---|---|
| New `pydicate-studio` repository | Desktop shell, phrase editor, source reader, review workflow, provider adapters, packaging, shared UI components. |
| `nhe-enga/pydicate` | Language operations, authoring representation contract, construction/capability descriptors, structured evaluation and provenance. |
| `nhe-enga/tupi` | Morphology, phonology, orthography, and realization rules. |
| `oldtupicorpus/authoring` | Source adapters, corpus records, metadata, reference comparison, review persistence, and MCP adapter. |
| `vscodetupy` | Power-user entrypoint that remains supported and can later embed the same editor/components. |

A separate app fits the nontechnical audience and lets it be installed without learning VS Code. Keeping shared language semantics in Python avoids creating a second grammar implementation in TypeScript. The existing corpus React frontend provides useful rendering pieces but is a dictionary/corpus browser; it is not yet the complete authoring desk.

Initial technical choice: **Electron + React/TypeScript, with a managed Python worker**. This reuses the current frontend and extension languages and accommodates local repositories, PDF viewing, file watching, Git, and agent subprocesses. Electron's main/preload/renderer separation fits this arrangement; keep filesystem and process operations behind a narrow validated bridge. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).

The Python application service should be callable by the UI through typed local IPC/RPC, while an MCP adapter exposes appropriate operations to agents. Ordinary form edits do not need to travel through an LLM or MCP session. Electron is a proposed implementation choice, not something already present in the repos.

For Kian: `Abrir projeto existente` locates known clones within a chosen parent folder, verifies repository identity/capabilities, reads branch and working-copy state, and offers explicit path correction. Avoid exhaustive disk scans or assuming every checkout is on `main`.

For colleagues: `Começar contribuição` sets up a managed compatible project with a bundled/managed Python runtime and a tested dependency set. Source scans are mapped or downloaded separately as needed. Installing Python, configuring `PYTHONPATH`, building VSIX files, and knowing Git commands must not be prerequisites.

The published snapshot mismatch makes a project compatibility manifest essential. Record engine and corpus revisions, schema and capability versions, and runtime dependencies. Keep the stable contributor environment separate from an experimental grammar worktree. Show errors in linguistic task terms while retaining expandable diagnostic details.

### Responsiveness and reliable evaluation

- Use revision IDs for every draft. Render results only if they belong to the current draft and engine fingerprint; discard late stale responses.
- Keep deterministic rendering independent from AI. Debounce previews, cache by dependency fingerprint, and show pending/error states without replacing good results with old ones.
- Detect engine edits and restart/reload the worker before verification. Existing `reload_engine` is the immediate bridge; long-lived caching must not silently test yesterday's code.
- Isolate source loading so one broken passage does not prevent reading PDFs, viewing saved references, or working on another document. The current test import failure demonstrates why this matters.
- Preserve unknown source text and autosaved drafts across crashes. External edits from VS Code trigger a source-version conflict instead of being overwritten.
- Define a comparison policy explicitly. Current reference comparison trims certain terminal punctuation; correction prompts sometimes ignore whitespace. The studio should show exact differences and labeled normalized comparisons, never silently accept a whitespace-insensitive match as identical editorial text.

### Capabilities for future Pydicate features

Extend the existing registry with operation ID/version, applicable types, named slots, parameter types/enums, output type, scope/ordering semantics, Portuguese labels, explanations, examples, renderer type, and source-code mapping. Reflection alone does not supply those semantics.

A new operation gets a generic structured form from its descriptor; important operations can add specialized controls. New outputs register typed projections such as annotated spans, a tree, a paradigm table, a derivation trace, or an export. This makes new engine capabilities discoverable without promising that arbitrary new Python can instantly become a good visual interface.

## Teaching and collaboration

Use Portuguese as the first interface language, with optional technical labels and preserved source-language text. Begin with one real passage and one small task. Let a new contributor correct a reading and save a note before introducing any formal operators.

Every control should answer three questions on demand: what does this operation mean, what changed in this example, and where else is this attested? Draw examples from approved corpus analyses and human-authored grammatical explanations. AI explanations remain labeled proposals until reviewed.

Treat reusable explanations, construction templates, contrasts, and grammar-navigation notes as maintained project knowledge. The application can become easier to teach through these approved resources; it should not silently change its grammar by learning from unreviewed AI outputs.

Preserve uncertainty: damaged text, alternative normalizations, competing lexical senses, attachment alternatives, and disputed analyses can remain explicit. A contributor can submit only the layer they know. Reviewers can compare alternatives without destroying either.

Support human collaboration before real-time coediting: assignments, contributor attribution, comments tied to stable passage/constituent IDs, reviewable change bundles, and pull-request synchronization. Present linguistic diffs first, with file diffs expandable. Phrase-level conflicts should ask the reviewer to choose or reconcile interpretations rather than exposing merge markers.

Shared lexical edits must say where they apply. `Só nesta ocorrência` and `Atualizar entrada compartilhada` have different consequences. Show affected passages before applying a shared edit and invalidate their verification status as appropriate.

## Delivery plan and acceptance gates

| Stage | Concrete deliverable | Gate |
|---|---|---|
| 0. Reproducible project | Compatible repo pair, dependency manifest, operation inventory, draft/approval semantics | Source load and baseline checks reproduced from a fresh contributor setup; existing mismatches recorded, not overwritten. |
| 1. Reading and review desk | Local project opening, source viewer, passage navigation, saved/current comparisons, translation and morpheme/tree views | A colleague can locate a passage, submit a reading/note, and review a result without code or terminal use. |
| 2. Vertical authoring slice | Lossless source adapter plus lexical lookup, participants, negation, mood, and single-passage drafts | Recreate Araújo 0067 visually; save/reopen; preserve reference; undo; inspect the exact expression. |
| 3. Full existing-language coverage | All rows of the coverage matrix, templates, nesting, reference relations, scope/order editing | All 122 current historic expressions and reachable helpers are visually representable and pass structural and rendering round-trip checks on the compatible baseline. |
| 4. Integrated grammar assistance | Contextual provider session, one diagnosis checkpoint, isolated correction, fresh-engine regressions, review handoff | Rehearse the 0074 `og` correction and a nested derivation case without changing the accepted analysis or blessing unrelated lines. |
| 5. Collaborative pilot | Managed installation, assignments, review queue, stable IDs, recoverable Git synchronization | Two or three linguists complete tasks independently; no code or terminal intervention needed for supported tasks. |

Do not promise calendar estimates before the source adapter and compatibility spike. That is the main technical uncertainty. The first useful release is the reading/review desk plus a complete authoring slice, while full replacement of manual authoring is gated by measured coverage.

Pilot tasks should include: diplomatic correction; assembling an imperative; selecting the `orébe` variant while retaining one surface word; editing possession/reference; building a nested nominalization; attaching a subordinate clause; entering a grammatical correction in prose; and reviewing an affected-versus-unaffected contrast. Measure task completion, assistance required, erroneous approvals, ability to explain the saved analysis, and successful recovery after a deliberate conflict. Timings can be recorded, but speed alone is not the success criterion.

## First implementation milestone

The best starting commit is a **read-only project adapter plus an editable Araújo 0067 slice**, in the new application repository, with a compatible pinned engine/corpus pair and round-trip checks. That makes the central interaction testable with a colleague immediately. Add the 0074 relation/repair example next, then the nested constructions from Bettendorff. Let those real tasks determine the UI before expanding the shell.

## Repository evidence links

- [Current extension authoring and correction workflow](https://github.com/kiansheik/vscodetupy/blob/d287b17edbfd63483e3d20ec40d372ed629fa1a8/docs/source-authoring.md)
- [Extension current state](https://github.com/kiansheik/vscodetupy/blob/d287b17edbfd63483e3d20ec40d372ed629fa1a8/docs/agent/current-state.md)
- [Corpus authoring contract and commands](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/docs/agent/source-authoring.md)
- [Corpus authoring implementation](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/authoring/service.py)
- [Corpus source annotation parser](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/authoring/source_annotations.py)
- [Araújo source expressions](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/historic/araujo_catecismo_1686.tu.py)
- [Bettendorff source expressions](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/historic/bettendorff_compendio.tu.py)
- [Shared lexicon and construction helpers](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/historic/lexicon.tu.py)
- [September corpus log](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/docs/agent/log.md)
- [Number nominalization handoff](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/docs/agent/session-handoffs/2026-09-16-number-nominalization.md)
- [Dictionary structure and span extraction](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/dictionary/utils.py)
- [Existing React morpheme display](https://github.com/kiansheik/oldtupicorpus/blob/c59f303f1aa6143e43806f27d30703206a846958/frontend/src/App.jsx)
- [Pydicate predicate operations and representations](https://github.com/kiansheik/nhe-enga/blob/348686045bf0791c847be3cba1b15eaae7312a11/pydicate/pydicate/predicate.py)
- [Existing compiler representation](https://github.com/kiansheik/nhe-enga/blob/348686045bf0791c847be3cba1b15eaae7312a11/pydicate/pydicate/compiler/ir.py)
- [Existing capability registry](https://github.com/kiansheik/nhe-enga/blob/348686045bf0791c847be3cba1b15eaae7312a11/pydicate/pydicate/compiler/registry.py)
- [Engine guardrails](https://github.com/kiansheik/nhe-enga/blob/348686045bf0791c847be3cba1b15eaae7312a11/AGENTS.md)
- [Grammar navigation and September `og` note](https://github.com/kiansheik/nhe-enga/blob/348686045bf0791c847be3cba1b15eaae7312a11/AGENT_NOTES.md)
