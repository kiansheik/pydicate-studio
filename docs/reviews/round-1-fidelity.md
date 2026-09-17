# Independent critic — round 1: fidelity

Reviewed the actual current Araújo source, complete lexicon, engine operator dispatch and Studio implementation. This is a fidelity review; contributor workflow and persistence rounds are separate and have not yet passed.

## Evidence and boundary

- Live Araújo SHA-256: `357b7e643d8ffe8e4c0386e3232016400be4421158b2668a4ab2e896a2a90a23`. Discovered 82 source expressions and independently imported 82 runtime expressions.
- 82/82 original expressions match the direct module in surface, annotations and the implemented runtime structure snapshot; 82/82 concrete UTF-16 span checks and unchanged-source byte round trips pass.
- The actual TypeScript serializer is imported through esbuild by `python3 -B scripts/critic-fidelity.py`. All 560 reference-to-compound replacement probes now preserve the intended scoped AST. The serializer bug was fixed during review before that final probe phase.
- This does not certify every proposed edit as linguistically correct. Runtime shape comparison excludes engine IDs/caches and is not a proof of scholarly equivalence.
- Independent per-expression results: [round-1-evidence.json](round-1-evidence.json). Disposable source write results: [round-1-source-probes.json](round-1-source-probes.json). No historical source was written.

## Findings

### R1-01 — High: original renderer replacement changed scope (fixed; verified)

Affected potentially any nested replacement. Reproduction: select `apiti` in 0067 and replace it with `apiti + potar`. The original TypeScript serializer emitted `-(+nde * apiti + potar * moro).imp()` while the Python audit used `-(+nde * (apiti + potar) * moro).imp()`. The original audit therefore tested a different serializer. Current TypeScript replacement wraps the inserted expression; 560 actual TypeScript replacements over every source reference now match explicitly scoped ASTs.

### R1-02 — High: source write changes unrelated repeated-passage identities (open)

Affected 0003, 0011, 0017 and 0026: all four identical `(amen)` expressions. In a disposable complete corpus copy, save a metadata-only note on 0067 and apply its reviewed preview. All four IDs change. `adapter.py` keys duplicates with the whole file hash, so an unrelated comment invalidates draft/PDF/AI bindings. Existing tests explicitly mark duplicates before editing and miss this ordinary initial state. The real-copy repro is recorded in the source-probes artifact. Establish stable identities or explicit conservative reassociation without orphaning unrelated evidence.

### R1-03 — High: expanded lexical inspection has a mismatched UI contract (open)

Affected every inspectable reference, including the named compounds `arobiar`, `third_day`, `tupapotaba`. API `lexicon_inspect` returns `{authoring: {root}, expandedStructure: runtimeShape}`. `AuthoringEditor` reads `expressionTree ?? expandedStructure` as an `AuthorNode` and `StructuredNode` immediately reads `node.children.length`; a runtime shape has no `children`. Use the actual typed tree contract and test the rendered inspection interaction.

### R1-04 — High: parameterized helpers have no expanded construction view (open)

Affected direct `credo` 0048–0053, `saguera` 0056/0058/0059, `pyreramo` 0057, `n` 0061/0074/0079/0080, plus transitive helper use through compounds. API inspection of each lambda returns a single unsupported Lambda node and a callable-only runtime shape. Calls in expression cards expose only their name/argument, not the helper body or parameter substitution. Fixing R1-03 alone will not address this. Provide inspectable parameter/body structure and an explicit distinction between bound reference and expanded copy.

### R1-05 — High: displayed cards discard authoritative runtime typing and roles (open at observation)

Affected all compound constructions. `evaluate_expression` returns runtime-annotated `tree`, typed operator dispatch and verb roles, but `useStudio` only stores the parse tree in `parsed`; the visible editor remains syntax-only `Construção *` and `Primeiro/Segundo elemento`. In addition, operation names imply fixed semantics for overloaded operators: binary `+` is labeled modifier although `tuba + tayra` in 0002 is noun conjunction in the selected engine. Feed the revision-matched runtime tree into the visible structure and explain operand-specific roles rather than symbol-only linguistic claims.

### R1-06 — Medium: coverage conflates syntax replacement with visual support (open)

Affected all 82 coverage rows. `audit_araujo.py` sets visualRepresentation from recognized AST kinds, and visualEditing from a redundant-parentheses rewrite of a single leaf. It does not exercise visual controls, helper argument binding, removal/replacement of existing moods or lexical reuse. Distinguish parser/tree representation, tested span editing, UI-family workflow support and remaining limitations. Dependency method inventory must include `.card()` through `third_day` (0034/0059), in addition to the direct source methods.

### R1-07 — High: applied source notes vanish when imported as new drafts (open)

Affected every applied note. Disposable-copy reproduction: apply `metadata.notes = "CRITIC note from source"` on 0067. `sourceMetadata.notes` contains the note, but imported `passage.notes` remains empty because `adapter.py` reads only legacy record notes. A fresh profile therefore does not recover authoritative human notes. Import source notes, while excluding the machine identity/evidence pointer from human note content.

## Per-expression fidelity

`Runtime` means surface/annotation/structure comparison to direct selected-engine evaluation. `Spans` includes every nested concrete node; `scoped edits` uses the actual current TypeScript serializer. UI findings above remain additional gates.

| Ordinal | Line | Runtime | Spans / no-op bytes | Scoped reference edits |
|---|---:|---|---|---:|
| 0001 | 9 | pass | pass | 14/14 |
| 0002 | 13 | pass | pass | 5/5 |
| 0003 | 14 | pass | pass | 1/1 |
| 0004 | 16 | pass | pass | 12/12 |
| 0005 | 19 | pass | pass | 3/3 |
| 0006 | 21 | pass | pass | 13/13 |
| 0007 | 26 | pass | pass | 10/10 |
| 0008 | 30 | pass | pass | 13/13 |
| 0009 | 32 | pass | pass | 7/7 |
| 0010 | 33 | pass | pass | 7/7 |
| 0011 | 34 | pass | pass | 1/1 |
| 0012 | 36 | pass | pass | 5/5 |
| 0013 | 37 | pass | pass | 6/6 |
| 0014 | 38 | pass | pass | 8/8 |
| 0015 | 39 | pass | pass | 7/7 |
| 0016 | 40 | pass | pass | 16/16 |
| 0017 | 45 | pass | pass | 1/1 |
| 0018 | 47 | pass | pass | 11/11 |
| 0019 | 51 | pass | pass | 10/10 |
| 0020 | 55 | pass | pass | 13/13 |
| 0021 | 57 | pass | pass | 5/5 |
| 0022 | 58 | pass | pass | 8/8 |
| 0023 | 59 | pass | pass | 13/13 |
| 0024 | 65 | pass | pass | 6/6 |
| 0025 | 70 | pass | pass | 16/16 |
| 0026 | 75 | pass | pass | 1/1 |
| 0027 | 77 | pass | pass | 8/8 |
| 0028 | 79 | pass | pass | 9/9 |
| 0029 | 84 | pass | pass | 11/11 |
| 0030 | 93 | pass | pass | 5/5 |
| 0031 | 94 | pass | pass | 10/10 |
| 0032 | 96 | pass | pass | 15/15 |
| 0033 | 100 | pass | pass | 5/5 |
| 0034 | 101 | pass | pass | 9/9 |
| 0035 | 103 | pass | pass | 5/5 |
| 0036 | 104 | pass | pass | 5/5 |
| 0037 | 105 | pass | pass | 12/12 |
| 0038 | 113 | pass | pass | 2/2 |
| 0039 | 114 | pass | pass | 2/2 |
| 0040 | 115 | pass | pass | 7/7 |
| 0041 | 116 | pass | pass | 7/7 |
| 0042 | 120 | pass | pass | 6/6 |
| 0043 | 121 | pass | pass | 4/4 |
| 0044 | 122 | pass | pass | 1/1 |
| 0045 | 125 | pass | pass | 5/5 |
| 0046 | 126 | pass | pass | 7/7 |
| 0047 | 127 | pass | pass | 4/4 |
| 0048 | 128 | pass | pass | 1/1 |
| 0049 | 129 | pass | pass | 1/1 |
| 0050 | 130 | pass | pass | 1/1 |
| 0051 | 131 | pass | pass | 2/2 |
| 0052 | 132 | pass | pass | 3/3 |
| 0053 | 133 | pass | pass | 4/4 |
| 0054 | 137 | pass | pass | 12/12 |
| 0055 | 141 | pass | pass | 16/16 |
| 0056 | 153 | pass | pass | 11/11 |
| 0057 | 161 | pass | pass | 10/10 |
| 0058 | 170 | pass | pass | 21/21 |
| 0059 | 199 | pass | pass | 6/6 |
| 0060 | 200 | pass | pass | 4/4 |
| 0061 | 201 | pass | pass | 7/7 |
| 0062 | 203 | pass | pass | 5/5 |
| 0063 | 204 | pass | pass | 3/3 |
| 0064 | 206 | pass | pass | 8/8 |
| 0065 | 208 | pass | pass | 2/2 |
| 0066 | 210 | pass | pass | 2/2 |
| 0067 | 211 | pass | pass | 3/3 |
| 0068 | 212 | pass | pass | 3/3 |
| 0069 | 213 | pass | pass | 2/2 |
| 0070 | 214 | pass | pass | 4/4 |
| 0071 | 215 | pass | pass | 7/7 |
| 0072 | 216 | pass | pass | 7/7 |
| 0073 | 217 | pass | pass | 8/8 |
| 0074 | 222 | pass | pass | 9/9 |
| 0075 | 225 | pass | pass | 5/5 |
| 0076 | 226 | pass | pass | 6/6 |
| 0077 | 227 | pass | pass | 4/4 |
| 0078 | 228 | pass | pass | 4/4 |
| 0079 | 230 | pass | pass | 6/6 |
| 0080 | 231 | pass | pass | 8/8 |
| 0081 | 235 | pass | pass | 9/9 |
| 0082 | 238 | pass | pass | 5/5 |

## Review status

Round 1 found material fidelity gaps. The original observations above are retained as an audit trail; the fix verification below records the current status.


## Independent fix verification — 2026-09-17

| Finding | Verification | Current result |
|---|---|---|
| R1-01 | Reran `scripts/critic-fidelity.py`: all 560 actual TypeScript scoped replacements, all 82 original runtime/annotation/structure and span checks | Fixed |
| R1-02 | Repeated the same disposable-copy metadata-only write; all 82 IDs retained, including four unmarked identical amém entries | Fixed for the reported repro; ambiguous duplicate reorder is a Round 3 gate |
| R1-03 | Native UI inspected and expanded `rightsidegod`, then reused its reference without a renderer exception | Fixed |
| R1-04 | API now supplies helper parameters and parsed body templates for `credo`, `saguera`, `pyreramo`, `n`; native UI bound `credo(x=tayra)` and evaluated it | Fixed for observed helper family; templates are an inspection view, not a claim that all future Python functions are visual |
| R1-05 | Native UI showed typed dispatch cards/verb roles across 0002/0016/0040/0058/0074/0079/0082; neutral combination label replaces symbol-only `+` modifier claim | Fixed |
| R1-06 | Current coverage names construction-tree and span-edit checks separately; no aggregate visual-workflow success claim; transitive `.card()` inventory present | Fixed |
| R1-07 | Same metadata-only application now imports the exact human note and excludes the machine note from `passage.notes` | Fixed |

Evidence: [updated independent matrix](round-1-evidence.json), [source fix probes](round-1-fix-source-probes.json), [native contributor probes](round-2-evidence.json). These results close the reported Round 1 findings at their stated boundaries. They do not certify the separate contributor and persistence rounds.
