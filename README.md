# Pydicate Studio

A Portuguese desktop reading and authoring desk for Old Tupi. Consult a historical PDF, contribute a reading, edit a nested Pydicate construction visually or directly, compare actual engine output, and keep unfinished work across restarts.

Version 0.2 opens the local `oldtupicorpus` project and Araújo by default. It continues the original Electron/React application; the bundled browser example remains available separately. The current audit finds 86 expressions. The [coverage matrix](docs/coverage/araujo.md) distinguishes concrete syntax, structure, editing probes, engine comparisons and UI verification.

## Start

Use Node.js 22.12+, npm, Git and Python 3.10+. The selected real engine was tested with CPython 3.14.4; Python is not bundled.

```sh
npm ci
npm run doctor
npm run desktop
```

The default workspace contains sibling clones:

```text
workspace/
├── pydicate-studio/
├── oldtupicorpus/
└── nhe-enga/
```

Set `PYDICATE_PROJECT_PARENT` to another parent directory and `PYDICATE_PYTHON` to a prepared interpreter if needed. **Abrir projeto** also selects a parent directory. The chosen project and passage are remembered. To run the production bundle, use `npm run build` followed by `npm start`.

This milestone depends on actual uncommitted corpus/engine modifications. A HEAD alone is insufficient. The original baseline is historical; the current audit records newer daily edits. The  [dependency instructions](docs/design/dependencies.md), the [file manifest](docs/design/next-baseline.json), and [binary patches](docs/design/dependency-patches/) record the tested state. Studio reports missing dependencies and fingerprint changes; it does not silently update neighboring repositories. `npm run doctor` checks this baseline without changing those repositories.

## Daily workflow

**Aprender** opens five guided lessons (about ten minutes) in Brazilian Portuguese, using preserved corpus examples and the same tree editor in an isolated practice workspace. Progress, step-by-step checks, hints, stage models, undo and optional questions to the configured AI provider are available. **Referência** also opens directly from the header and links concepts to UI actions, code, current implementation signatures and examples from both historic sources. Start with **Comece aqui** for the beginner roadmap. Browser-only mode shows compiled examples; live editing and checking require the desktop project. No tutorial attempt publishes corpus or reference changes.

The build regenerates this material from source comments/docstrings and local `.tu.py`/ground-truth records. Run `npm run docs:build`, `npm run docs:check`, and `npm run test:learning`; set `PYDICATE_PROJECT_PARENT` for non-sibling repositories. See [maintaining the learning reference](docs/design/learning.md).

1. Choose an Araújo passage. **Vincular PDF à fonte** makes a managed persistent copy of its witness. Draw, move, resize or remove regions; save the evidence and return to the same physical page later. Printed page, folio and textual lines remain separate from PDF page numbers.
2. Contribute transcription, interpretation and uncertainty independently. **Adicionar próxima passagem** opens an empty tree in the ordinary passage list, carrying the last edited page/folio/section/subsection and showing the previous PDF box as a guide. Pending readings remain local until their source diff is reviewed.
3. **Árvore** opens as the main editor. Lexical references are cards; Pydicate operations are selectable connections that retain their exact source grouping. Select a card or connection to add an operand on either side, change an operator, edit an argument, or remove an operation while choosing its retained branch. Evaluated engine types and roles are supporting evidence. Search reveals actual occurrences and hidden branches; click the canvas for wheel zoom around the pointer. Pan, collapse, fullscreen within the app window and undo/redo are available. Reused definitions can become editable through an explicitly verified copied occurrence. **Código** edits the same draft, including incomplete text; valid source trees remain editable when engine evaluation fails.

   Each connection displays its intermediate evaluated form, with **Resultado final** at the root and the full selected result in the inspector. Chevrons collapse/expand branches. Portuguese operation names and explanations accompany the exact Pydicate syntax; unavailable isolated steps and genuinely empty forms are identified explicitly.

4. **Léxico** lists the current passage's variables and recursively expands composites/helpers to their base predicates. Keep separate general lexical notes and meanings/grammar for each occurrence; the project notebook searches and exports those interpretations with history. **Localizar na estrutura** returns to the matching tree scope. The expandable project catalog retains reviewed definition editing. **Dicionário** embeds the actual local dictionary website, including conjugations and citation scans; clicking a headword or **+ Árvore** creates a piece from that exact sense. **Adicionar peça** starts with one search: existing structures first, then Navarro entries, with manual creation/code as secondary choices. See the [dictionary workflow](docs/design/dictionary.md).
5. **Fonte / IA** share the right support pane while the builder stays visible. Enter the diplomatic text and optional **Grafia provável em Navarro**, then **Salvar e analisar**. The saved input feeds a durable tool-driven job: local dictionary research, shared builder edits, evaluation and isolated proposals. Inspect a proposal, **Questionar / refinar**, then explicitly **Usar no rascunho**, with undo. Batch submission, per-passage conversations and background progress persist. See the [contributor guide](docs/contributor-guide.md).
6. **Concluir passagem** moves completed work into **Concluídas**. The **Etapa do meu trabalho** selector also allows analysis/review/reopening; this local workflow persists independently of reference approval.
7. **Commit to Ground Truth**, beside Verificar and Salvar rascunho, opens review directly. First review/apply any draft changes with **Revisar edição da fonte**. Then inspect the complete form and choose **Confirmar e salvar ground truth**. This updates the selected corpus reference through the authoritative engine and marks local work complete. Missing references must be added in source order. Git sharing remains a separate reviewable patch.

The source defaults to the right of the tree. Drag a pane title or use its position selector to move **Passagens**, **Editor** or **Fonte**; resize their borders, collapse or maximize them. The layout persists, and hidden/moved editors keep their working state. **Comparar referência** opens the saved surface beside the current result. Retained old drafts are in one searchable archive instead of a long list of empty association buttons.

To reuse a word or construction, type how it reads in Tupi in **Escreva como se lê em tupi…**. Spaces do not matter: `o emi tym bûer ypy` finds the existing `oemitymbûerypy` construction, including its unnamed source subtree. Search includes named predicates, source steps and current drafts, with their origins shown; longer readings can offer recognized portions. Choose a result to prepare its verified expression, then apply it to the selected tree part or argument. **Editar código Pydicate** retains direct entry. The first search builds a local cache in a few seconds; it uses no AI provider. See [rendered reuse](docs/design/rendered-reuse.md).

When the next passage has no PDF location, it inherits the previous applicable page/region as an editable working copy. Its own saved location or draft wins. **Salvar regiões** confirms the new location; simply navigating does not change the evidence manifest. See [workspace and PDF behavior](docs/design/workspace-and-pdf.md).

**Atividade** opens the local usage/error history with optional profile naming and export. `npm run usage -- --days 7 --json` gives a read-only report for the next agent session. Logs begin with this version and contain categorical actions, timings and errors, not private text or credentials. See [logging details](docs/design/usage-logging.md).

External changes preserve drafts and show both source and editorial versions before reconciliation. Unmarked identical insertions can be ambiguous; retained drafts require explicit reassociation. Source-adjacent IDs retain stable bindings after reviewed edits. No-op export preserves bytes, and targeted source edits preserve unrelated text.

## Providers and evidence

**Corrigir gramática / árvore** prefills the current output for editing and submits the desired form plus linguistic notes into a new Codex conversation in IA. Explicit grammar repairs use the selected local `nhe-enga` folder through checked grammar-only tools, automatically reload and compare the same expression and corpus, and preserve source/reference approval as separate decisions. Conversations remain selectable and can run concurrently; repairs sharing a grammar folder run in sequence. See the [contributor guide](docs/contributor-guide.md#corrigir-uma-forma-gerada).

Codex uses its CLI-authenticated App Server with only the scoped Studio MCP tools enabled. Claude uses iterative Messages API tool rounds with `ANTHROPIC_API_KEY` and optional `ANTHROPIC_WORKSPACE_ID` in the launching environment. Credentials stay in the main process. New conversations and candidates remain separate from readable legacy AI histories. See [provider integration](docs/design/ai-agent-providers.md) and [external MCP setup](docs/design/mcp-agent-guide.md).

The default input is text and saved evidence metadata. Selecting images supplies actual managed PDF crop pixels with preserved page geometry and hashes. Models cannot open arbitrary files, browse, alter shared lexicons, publish source or approve references through the tool service. Closing a window preserves work while the local owner runs; interrupted attempts require explicit retry and may consume provider usage again.

Routine verification uses deterministic transports with **no paid generation**. Installed Codex 0.153.4 initialization/scoped thread setup and Claude model-discovery authentication were rechecked without inference. The historical Claude billing failure has not been disproved by model discovery; a budgeted live linguistic experiment remains separate.

`npm run test:codex-tools` checks the installed Codex code-mode/MCP transport against a local fake model endpoint: disabled-host reproduction, complete-tool preflight and guide/create/evaluate/propose calls, with zero paid requests. It requires the installed CLI and its cached `gpt-5.6-terra` metadata; it is separate from portable unit tests.

PDFs and regions live in application data, with fingerprint/replacement checks and same-witness relocation. Source comments store the stable versioned evidence pointer. A Git patch alone does not contain the managed PDF or private draft/AI state. See [PDF evidence format](docs/design/pdf-evidence.md). Clearing application data removes these local assets; retain independent source PDF backups.

## Experimental: Tupi → Pydicate laboratory

A hidden workspace that proposes a Pydicate analysis for a normalized Tupi
string. It is absent until you enable it under **Informações do projeto →
Recursos experimentais**; nothing in it runs until you ask. **Preparar baseline**
builds a small local index, and **Analisar** then folds the input (spaces, case
and accents are discarded, apostrophes are not), searches recorded corpus
expressions and declared grammar families, and accepts only analyses the selected
engine realizes back to the same form. The result opens in the real tree editor
and never publishes source or approves a reference.

```sh
npm run parser-lab -- --parent <pasta> --artifacts <dir> prepare --profile smoke --activate
npm run parser-lab -- --parent <pasta> --artifacts <dir> analyze "Asó xe rokype"
npm run test:smoke:parser-lab
```

When a form has more than one reading, all of them are shown with the exact tag
that separates them, and you pick. That choice applies to the next analysis of
the same sentence immediately, and it is the signal the laboratory learns from:
analyses, verdicts and corrections are kept locally, confirmed readings become
reviewed examples, and inputs it could not analyse become a coverage-gap list
saying what to add next.

It is a bounded laboratory, not a general parser for historical Tupi: it composes
only the lexemes and constructions its profile declares, and it reports unknown
rather than guessing. See [the contract](docs/design/parser-lab.md) for the
declared limits and the measured results.

## Validation

```sh
npm run check
npm run test:e2e
npm run test:smoke
npm run test:session
npm run audit:araujo
node scripts/smoke-analysis.mjs
npm run eval:authoring:build
```

`check` formats-checks, builds, and runs domain, Electron service and Python tests. The real-corpus Python tests use disposable copies of installed siblings; absent siblings are reported as skips. Browser tests include explicit simulated race/failure contracts and actual PDF.js rendering. `test:smoke` launches production Electron with temporary user data and a disposable corpus; it never applies its edits to the historical source. Authenticated provider probes are separate and are not part of routine tests.

Evidence: [native workflows](docs/coverage/native-workflows.json), [actual Navarro queries](docs/coverage/navarro-queries.json), [three independent reviews](docs/reviews/), and [current verified state](docs/agent/current-state.md). Full runtime comparisons do not prove linguistic correctness; review claims use these separate measures.

`npm run dev` opens the browser-only example. Local Python, corpus writes, managed PDF storage and provider connections require Electron. This is a developer-run application: no installer or bundled Python runtime is supplied. Start code exploration with [the agent guide](docs/agent/index.md), [desktop contract](electron/README.md), and [Python contract](python/README.md).
