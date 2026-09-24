# Independent translations for source-enriched corpus PDFs

## Goal

Allow Portuguese and English passage translations to be recorded independently
and exported with source evidence, preserving unlabelled existing text.

## Files inspected

`AGENTS.md`, agent index/current-state/repo-map/open-questions; source-text
contract; Passage/Draft types, model, source/review/translation interfaces,
draft/desktop validation, Python adapter and source publication, evidence and
lexical-note schemas. Read-only current corpus and Studio state established
which fields currently exist; no contributor source was executed for that audit.

## Files changed

Types/model/translation helpers; SourcePane, App, new-passage and archive editors;
GroundTruthPanel and useStudio metadata propagation; AssistantPanel and
AnalysisSupport language-specific acceptance; desktop schema; Python adapter,
source serializer/validator; focused domain/desktop/Python/browser tests; this
handoff, current state, log and source-text contract. No native corpus schema,
engine behavior or source data was changed.

## Commands run

- `npm run typecheck`
- `npx vitest run src/domain/model.test.ts src/domain/translations.test.ts src/domain/next-page.test.ts src/domain/ai.test.ts`
- `node --test electron/tests/draft-store.test.cjs`
- `PYDICATE_PROJECT_PARENT=/Users/kian/code PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest python.tests.test_authoring.CorpusCopyTests.test_pt_en_translations_source_roundtrip_clear_and_legacy_separation python.tests.test_authoring.CorpusCopyTests.test_new_passage_pt_en_translations_have_no_legacy_language_assumption python.tests.test_source_text -v`
- `npx playwright test --config playwright.translations-isolated.config.ts tests/translations.spec.ts tests/translation-workflow.spec.ts`
- Prettier on changed TypeScript/JavaScript files only.

## What worked

TypeScript passed; 30 domain checks, six desktop draft-store checks, six Python
checks and three browser scenarios passed. Python used a disposable corpus copy
and current installed engine; source edits never targeted the user's corpus.
Browser checks used a separate port 5189 and simulated responses, never a live
provider. Exact multiline/whitespace/Unicode values survive source reopening;
clearing Portuguese keeps English and legacy text. New passages do not inherit
translations; accepted Portuguese suggestions preserve both legacy and English.

## What failed

A dependency symlink initially placed Vite's temporary config in the read-only
sibling; individual package symlinks and a local cache fixed that. The sandbox
initially blocked the local listener; authorized test escalation allowed it.
The first browser attempt reused the author's existing port 5173 server and
therefore saw old UI; it was not evidence about this change. A dedicated isolated
config on port 5189 fixed the test and left the existing server running.

## Remaining questions

The native corpus JSONL schema has one unlabelled translation field; this change
stores labelled translations in portable `studio:v1` source comments. The PDF
adapter must read that extension, not infer language from old strings. Languages
other than Portuguese/English continue through the legacy unlabelled slot.
No real provider request or author's live desktop write was tested.

## Suggested next prompt

Read the source-text contract and inspect the author's local Studio after its
main process restarts. Verify separate Portuguese and English translations in a
real editing session; keep historical unlabelled text and unrelated dirty edits.
