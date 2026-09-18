# Tupi parser lab research handoff

## Goal

Research maximal reuse across the Tupi repositories, test a small inverse path,
and deliver a complete implementation-agent prompt on a new Studio branch. The
requested next feature is a hidden tab accepting case/space/diacritic-insensitive
Navarro Tupi and returning editable Pydicate and engine morphology, with data,
training and evaluation controls in the same workspace.

## Branch and source state

- Branch: `codex/tupi-parser-lab`.
- Studio base: `8d21298c41ac5e5a66877b64ed96e02f00d31e56`.
- Dependency bases: `nhe-enga@348686045bf0791c847be3cba1b15eaae7312a11`
  and `oldtupicorpus@292a28722a1790abf3f3b93083c29fbd47b4ffd0`.
- Existing Studio dependency patches were checked/applied only to disposable
  copies for execution. The originals remained unchanged.

## Inspected areas

Agent guides; dependency baseline/patches; App and LearningWorkspace; the real
PydicateTree/ExpressionCanvas and shared TypeScript authoring entry; source AST,
bounded interpreter, evaluation snapshots, structure indexing/normalization;
Python bridge and worker; analysis queue/store, scratch MCP and iterative agent
runner; reconstruction evaluation exclusions; corpus synthetic/tokenizer and
historical sources; engine compiler and dictionary. Current main already has the
agent loop and guided learning; older architecture notes understate that reuse.

## Added/changed

- `docs/design/tupi-parser-lab-implementation.md`: research findings, reuse map,
  complete agent assignment, milestones and observable acceptance gates.
- `scripts/experiments/probe-parser-lab.py`: bounded research probe, not the
  production parser or a generic inverse grammar.
- `docs/evaluation/parser-lab-probe.json`: real run including versions, hashes,
  example morphology/tree edit, synthetic cases, collisions and limitations.
- Agent current state, log and this handoff.

No product UI, provider configuration, model training or corpus approval was
implemented. No sibling source files were edited.

## Commands and outcomes

After preparing disposable dependency snapshots as described in the dependency
guide, ran from Studio:

```sh
python -B scripts/experiments/probe-parser-lab.py \
  --parent /path/to/disposable-dependency-parent \
  --output docs/evaluation/parser-lab-probe.json
```

Exit 0. Generated 145 fragments (25 clauses, 120 possessive PPs), no generation
exceptions, 3,000 possible combinations. On a fixed seed sample of 60, all 60
generating source expressions occurred in the returned candidate set. Full
sentences were absent from the reverse index; all required fragments and one
composition rule were present. This is a narrow synthetic coverage check.

Actual shared parser/interpreter produced `asó xe rokype`, a ten-node editable
source tree and complete morphology. The shared source-span transaction changed
the possessor to `nde` and produced `asó nde rokype`. Several case/spacing/accent
variants shared the same key and candidates. `zzzz` and the historical spelling
were outside this parser's coverage. No native UI gesture was executed.

The engine's existing annotated decompiler, even with gold annotations, corpus
lexicon and reranking, produced `asó xe okype`. Preserve original generated source
as training targets. Dictionary IDs 2452/2453 and 2454/2456 demonstrated genuine
headword collisions under accent folding. The tiny fragment set itself had no
collisions, so its perfect recovery result says nothing about ambiguity ranking.

Python syntax, JSON result invariants, local Markdown links and whitespace were
checked after writing the documents. Product tests/build were not rerun because
this commit changes only research scripts, evidence and documentation. The
implementation assignment requires real native-bridge and product verification.

## Remaining questions and constraints

- Broader historical parsing accuracy and user correction effort are unmeasured.
- The user's current local corpus can be newer than the public dependency base;
  recount/fingerprint the selected project instead of hardcoding corpus counts.
- Accent removal makes some analyses irreducibly ambiguous without context.
- Morphology/tag alignment is not automatically a correct source-node alignment.
- Meaningful ranking needs contrasting candidates and multi-positive labels,
  not only trivially unique synthetic answers.
- Large model training/download and optional paid inference were not attempted.
- Historic orthography/OCR remain a separate future input channel.

## Suggested next prompt

Implement `docs/design/tupi-parser-lab-implementation.md` on
`codex/tupi-parser-lab`, starting with the hidden workspace and offline
compositional vertical slice. Complete the mandatory preparation, small real
training/evaluation and native end-to-end gates. Reuse current code, preserve
the selected corpus and report actual limitations. The document is the full
assignment; do not stop after writing another plan.
