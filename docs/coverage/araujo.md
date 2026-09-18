# Araújo coverage audit

Discovered **86 expressions**. Read-only actual-engine audit with the dirty corpus/engine contents recorded below.

| Measure | Passing |
|---|---:|
| import | 86/86 |
| constructionTree | 86/86 |
| spanEditRoundtrip | 86/86 |
| serialize | 86/86 |
| reimport | 86/86 |
| sourceByteRoundtrip | 86/86 |
| evaluation | 86/86 |
| surfaceComparison | 86/86 |
| annotationComparison | 86/86 |
| structureComparison | 86/86 |
| uiWorkflowVerified | 0/86 |

Methods including transitive lexical/helper dependencies: base_nominal, card, circ, imp, perm, redup, var, verbete, voc.
Helpers/constructors: cop, credo, n, pyreramo, saguera, v.

## Interpretation

- constructionTree verifies recursive card encoding; spanEditRoundtrip verifies concrete replacement/reimport. visualEditingImplemented denotes available controls, while visualEditing/uiWorkflowVerified require source/dependency/UI/integration-matched per-expression native UI evidence. Unknown/mismatched evidence stays null. Tested interactions establish specific scope and lexical replacement workflows, not every possible linguistic edit.
- Actual-engine direct module import is compared to the bounded AST interpreter with source context in execution order.
- Morpheme tags are authoritative engine output; internal token-to-constituent alignment is not inferred.
- Span-edit probe changes a leaf via the actual span serializer with redundant parentheses; syntax and all runtime structure, annotations and surfaces must remain equal.
- Source byte comparison and targeted source-write tests are separate from editorial approval.
- Structural comparison excludes volatile node IDs and includes grammatical flags, argument/adjunct order, lexical class and engine internal values.

## Every expression

| Expression | Physical lines | Constructs | Tree / span edit / reimport | Engine / surface / annotations / structure | Native UI | Diagnostics |
|---|---|---|---|---|---|---|
| 0001 | 9–12 | *, +, -, ==, imp, voc | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0002 | 13–13 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0003 | 14–14 |  | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0004 | 16–18 | *, +, @, perm, voc | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0005 | 19–19 | *, perm | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0006 | 21–24 | *, +, perm | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0007 | 26–28 | *, +, @, imp, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0008 | 30–31 | *, +, imp, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0009 | 32–32 | *, +, -, /, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0010 | 33–33 | *, +, /, <<, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0011 | 34–34 |  | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0012 | 36–36 | *, +, verbete, cop, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0013 | 37–37 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0014 | 38–38 | *, +, / | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0015 | 39–39 | *, +, /, cop | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0016 | 40–44 | *, +, <<, >>, imp, verbete, cop, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0017 | 45–45 |  | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0018 | 47–50 | *, +, ==, base_nominal, verbete, cop, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0019 | 51–54 | *, +, circ, redup | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0020 | 55–56 | *, +, <<, ==, circ, verbete, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0021 | 57–57 | *, +, voc | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0022 | 58–58 | *, +, /, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0023 | 59–63 | *, +, /, >>, imp, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0024 | 65–69 | *, verbete, voc, cop, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0025 | 70–74 | *, +, <<, perm, verbete, cop, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0026 | 75–75 |  | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0027 | 77–77 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0028 | 79–81 | *, +, /, cop | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0029 | 84–91 | *, >> | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0030 | 93–93 | *, +, cop | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0031 | 94–95 | *, +, /, >> | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0032 | 96–99 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0033 | 100–100 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0034 | 101–102 | *, +, /, card | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0035 | 103–103 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0036 | 104–104 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0037 | 105–112 | *, +, << | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0038 | 113–113 | * | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0039 | 114–114 | * | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0040 | 115–115 | *, /, base_nominal, redup | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0041 | 116–116 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0042 | 120–120 | *, / | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0043 | 121–121 | *, +, @ | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0044 | 122–122 |  | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0045 | 125–125 | * | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0046 | 126–126 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0047 | 127–127 | *, @ | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0048 | 128–128 | credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0049 | 129–129 | credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0050 | 130–130 | credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0051 | 131–131 | *, credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0052 | 132–132 | *, var, credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0053 | 133–135 | *, @, credo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0054 | 137–139 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0055 | 141–150 | *, +, <<, @ | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0056 | 153–159 | *, +, base_nominal, saguera | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0057 | 161–167 | *, +, pyreramo | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0058 | 170–197 | *, +, /, >>, @, base_nominal, var, saguera | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0059 | 199–199 | *, +, /, card, saguera | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0060 | 200–200 | *, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0061 | 201–201 | *, base_nominal, var, verbete, n | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0062 | 203–203 | * | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0063 | 204–204 | *, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0064 | 206–206 | *, +, -, /, <<, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0065 | 208–208 | *, imp, var, verbete | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0066 | 210–210 | *, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0067 | 211–211 | *, +, -, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0068 | 212–212 | *, +, -, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0069 | 213–213 | *, +, -, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0070 | 214–214 | *, +, -, imp, verbete, v | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0071 | 215–215 | *, +, -, imp | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0072 | 216–216 | *, + | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0073 | 217–220 | *, +, base_nominal | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0074 | 222–222 | *, +, base_nominal, n | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0075 | 225–225 | * | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0076 | 226–226 | *, +, base_nominal, verbete | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0077 | 227–227 | *, +, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0078 | 228–228 | *, +, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0079 | 230–230 | *, +, /, base_nominal, var, n | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0080 | 232–234 | *, +, base_nominal, n | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0081 | 236–236 | *, +, /, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0082 | 240–240 | *, +, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0083 | 249–249 | *, +, /, base_nominal | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0084 | 254–254 | *, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0085 | 260–260 | *, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |
| 0086 | 268–268 | *, +, /, base_nominal, var | yes / yes / yes | yes / yes / yes / yes | — | — |

Exact expressions, byte spans, inherited source metadata, transitive lexical definitions, contextual mutations, typed dispatches, annotations and fingerprints are in [araujo.json](araujo.json).
