# Formatting-aware passage reconciliation

## Goal

Do not require reconciliation for Black-only spacing, line breaks, quote style,
trailing commas or redundant parentheses. Retain protection for actual syntax,
literal, comment and scholarly metadata changes, including existing saved drafts.

## Files inspected

Required agent docs; adapter identity registry/editorial fingerprints; source AST
parser; draft model/restore; useStudio load/refresh/conflict paths; Python adapter
and authoring tests; model tests and authoring-sync browser harness.

## Files changed

- `python/studio_authoring.py`: versioned AST/comment expression fingerprint,
  returned by parse-only requests. No contributor expression execution.
- `python/adapter.py`: syntax-based editorial hash plus original exact legacy
  editorial hash for migration; identity registry stores and matches syntax keys.
  Scholarly metadata remains part of the editorial hash. File hashes stay exact.
- `src/domain/{types,authoring,model}.ts`: optional passage/parser fingerprints,
  proved old-hash migration and comparison of all human fields/locators.
- `src/useStudio.ts`: old conflicting drafts with identical human fields may
  rebase after parse-only syntax equality. Revision/context/draft-object guards
  reject late responses; draft text, revision, canvas and notes are retained.
- Python expression-fingerprint/authoring tests, model tests and browser sync test.
- Agent current state, log, repo map and this handoff.

## Commands and results

- `python3 -B -m unittest python.tests.test_expression_fingerprint python.tests.test_authoring.CorpusCopyTests.test_black_only_changes_keep_identity_and_editorial_fingerprint python.tests.test_authoring.CorpusCopyTests.test_metadata_fingerprint_detects_external_human_edits_but_ignores_machine_pointer -v`: four passed.
- Four targeted adapter identity tests: restart/insertion, duplicate insertion,
  stationary duplicates and ambiguous insertion: all four passed.
- `npx vitest run src/domain/model.test.ts`: 20 passed.
- `npx playwright test --config /private/tmp/pydicate-multipage.config.ts tests/authoring-sync.spec.ts --grep 'formatting-only refresh|keeps a real source conflict'`: two passed.
- `npm run typecheck`, `npx vite build`, `git diff --check`: passed. Existing Vite
  chunk-size advisory remains. No generated-learning rebuild.

## What worked

A disposable real-corpus passage retained its ID and editorial fingerprint after
extra wrapping parentheses/newlines. Meaningful metadata still changed the hash.
Browser refresh automatically rebased an old formatting conflict while preserving
the exact draft revision, text and loose piece, and performed no source/GT writes.
Actual human-source conflicts remain explicit. Future local edits survive source
formatting because their baseline syntax fingerprint remains unchanged.

## Failures / limits

Initial typecheck found optional callback/parameter types in the new browser mock;
corrected assertions, then typecheck/build passed. No product check failed.

For an old draft whose raw text differs substantively and whose old base source is
unavailable, migration cannot prove the change was formatting-only and retains
normal reconciliation. Missing/ambiguous identities are not guessed from ordinal.
Human metadata and comment content are not whitespace-normalized as source code.
Incomplete/unparseable drafts retain recovery behavior. File mutation/preview
freshness remains byte-exact, so a formatter changing an already-open reviewed
file still requires a fresh review before writing.

No real corpus changes, source publication, ground-truth approvals, provider calls,
commits or pushes were made.

## Remaining questions

None for the reported formatting-only conflict. A complete historical three-way
baseline would be needed to auto-merge old substantive drafts without their base.

## Suggested next prompt

Restart Studio and reopen the cited passage. Formatting-only differences should
clear without changing the saved draft; report any remaining conflict with the
specific differing human field or expression.
