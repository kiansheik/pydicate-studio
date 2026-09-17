# Compound annotation and tree title repair

## Goal

Investigate and fix the user-reported `o[PRONOUN:MAIN_CLAUSE_SUBJECT:3p]emi[PATIENT_PREFIX]tym[ROOT]bûer[PRETERITE_SUFFIX]ypy` combination without inventing a new spelling or changing the corpus's existing analysis.

## Files inspected

Studio agent index/state/map/questions, runtime graph producer/tests and tree heading rendering; neighboring AGENTS and nhe-enga agent index/state/map/questions/grammar-navigation; `Predicate.compose`, `Deverbal._apply_compositions`, `Classifier`, `TupiNoun.compose`, `AnnotatedString`; Araújo source line235, lexical `ypy`/`tym`, existing emi and m-pluriform regressions; authoring context/render/ground-truth verification services. Memory pointers for annotated role authority were checked against current source.

## Files changed

- Studio: `python/authoring_runtime.py`, `python/tests/test_runtime_tree.py`, agent current-state/log and this handoff.
- nhe-enga: `pydicate/pydicate/predicate.py`, `pydicate/pydicate/lang/tupilang/pos/deverbal.py`, new `pydicate/tests/test_compound_annotations.py`, agent current-state/log/grammar-navigation and its same-date compound handoff.
- Existing dirty work in all repositories was preserved. No historical source, lexicon, reference JSONL, generated baseline, commit or push was changed.

## Diagnosis and result

The exact pasted string is the composed classifier's internal `verbete`; Studio used it verbatim as the SVG/inspector title. Labels now remove inline engine metadata, leaving `oemitymbûerypy`. Raw annotations remain intact in attributes; graph extraction does not invoke evaluation or mutate the object.

The engine also dropped the modifier's existing lexical `[ROOT]` because both composition paths rebuilt bare `modifier.verbete` with `noroot=True`. A guarded shared helper now reads the stored lexical noun base and preserves its root tag only when it exactly matches the normalized single-word stem. It does not evaluate plain-noun inflection or infer tags for explicit untagged, composite, multiword or already annotated modifiers. Low-level Tupi composition already preserves supplied annotations and needed no edit.

The source expression remains `(pûera * (og * (emi * tym))) / ypy`. Plain output remains `oemitymbûerypy`; annotated output is now:

```text
o[PRONOUN:MAIN_CLAUSE_SUBJECT:3p]emi[PATIENT_PREFIX]tym[ROOT]bûer[PRETERITE_SUFFIX]ypy[ROOT][CLASSIFIER:PAST]
```

## Commands run / what worked

- Studio: `python3 -B -m unittest python.tests.test_runtime_tree.RuntimeGraphTests -v`: new title regression failed before repair; all five graph tests pass afterward.
- nhe-enga: `python3 -B pydicate/tests/test_compound_annotations.py -v`: two annotation assertions fail before repair; all five tests pass afterward. Before disk application, the patch was also checked in an isolated in-memory candidate.
- oldtupicorpus: `python3 -B -m unittest tests.emi_referential_test tests.m_pluriform_possession_test -v`: six pass, preserving absolute `temityma`, referential `oemityma`, possessed `nde remityma`, past `oemitymbûera`, and `(m)/(t)` contrasts.
- Fresh read-only before/after rendering: all 82 Araújo and 40 Bettendorff surfaces identical. Source/lexicon/reference SHA-256 checks unchanged. Service `verify_ground_truth()` remains successful for all 120 saved targets, with existing unsaved Araújo81–82 reported.
- Native production Electron `/tmp/pydicate-compound-native.mjs`: actual passage81, exact full surface, searched/selectable plain tree heading, no renderer errors. Isolated profile/screenshot: `/tmp/pydicate-compound-native-SmiKrm`.
- `git diff --check` in Studio and nhe-enga.

## What failed / verification limits

- The first context probe used `window` instead of `radius`; corrected. `get_source_context` cannot address unsaved ordinal81, so the actual source expression and existing regression supplied its context. Available authoring service functions were called directly because MCP authoring tools were not exposed in this session.
- Strict `python3 -B -m authoring.ground_truth_cli verify --source araujo_catecismo_1686 --source bettendorff_compendio --json` is not fully clean: Araújo74's existing JSONL lacks source-inherited location metadata; Bettendorff passes. This differs from the successful surface-only verification. The location difference and unchanged file hashes establish that this is pre-existing; no regeneration was performed to conceal it.
- Black is unavailable in the active interpreter and nhe-enga virtualenv. No formatter/dependencies were installed.
- No live AI generation was requested or used. Renderer JS did not change; Python/engine changes require refreshing/restarting Studio's engine context. The previous recorded dependency baseline remains historical and was not regenerated for this additional local engine patch.

## Remaining questions

The user supplied an annotated title without another intended spelling and did not answer the optional word-versus-annotation clarification during execution. Both confirmed software defects are repaired; a different linguistic target still requires the user's expected form/source evidence. Existing classifier freezing of inner arguments is outside this metadata repair.

## Suggested next prompt

If Araújo81 should have a different spelling or structure, supply the expected form and witness evidence; inspect the exact expression and annotated morphology before proposing any change to its grammatical analysis. Review Araújo74's source/reference location metadata separately, without automatic reference regeneration.
