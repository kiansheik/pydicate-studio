# PR #16 local CI repair — 2026-10-01

## Goal
Prepare a reviewable local patch at GitHub-verified head `4d0a60c099e9f8d562f7c694181cc801de292156`. Initially local-only; later user approval authorized a focused follow-up branch
and draft PR against `unlocked-light-deploy`. No merge or deployment.

## Inspected
AGENTS.md and agent index/current state/map/open questions; local Codex memory summary; package/CI workflows; usage validator/renderer/tests; hosted bridge/pressure tests; App/useStudio/AnalysisSupport/next-page/organization; affected browser fixtures. No applicable repo .agents skill directory was present.

## Changed
- `electron/usage-service.cjs`
- `electron/tests/usage.test.cjs`
- `server/tests/bridge-pressure.test.cjs`
- `src/components/AnalysisSupport.tsx`
- `tests/next-hook-harness.tsx`
- `tests/passage-navigation.spec.ts`
- `tests/navigation-url.spec.ts`
- `tests/analysis-workspace.spec.ts`
- `tests/proposal-publication.spec.ts`
- `tests/shared-tree-edit.spec.ts`
- `server/tests/source-workflow.test.cjs`
- `docs/agent/current-state.md`
- `docs/agent/log.md`
- `docs/agent/session-handoffs/2026-10-01-pr16-local-ci-repair.md`

## Commands and outcome
Before/after focused Node tests reproduced all four failures, then passed all 13. Format, typecheck, build:app, npm test, test:desktop, test:python, test:collab and complete test:e2e all pass in the standard configuration. Enabled hosted browser/real-adapter/full-editor/source/PDF/grammar-reload/reference-publication gates pass against isolated PostgreSQL and disposable corpus copies. Exact counts and final logs are recorded in `../pr16-review-summary.txt` and `../pr16-evidence/`.

## What worked
Activity allowlist and browser API mocks resolve the original failures without changing transport logic. Deferred reply focus passes the existing question/candidate/node/revision regression. Explicit fixture selection preserves latest-startup coverage; source switching no longer reassigns fixture rows. Orientation, retained-tab selectors and PDF autosave assertions now follow the actual UI.
The branch rerun exposed a saved-scan timing race: canvas visibility preceded its
asynchronous PDF render. Pixel assertions now poll the same real ink threshold
instead of inspecting the initial blank frame. Focused analysis/startup/URL cases: 35 passed. Publication/shared-tree/source recovery cases: 23 passed. Full browser: 296 passed, 105 conditional skips, zero failures. Supplemental real desktop: 11 passed without skips.

## What failed and boundary
An extra corpus-enabled Python run completed 442 tests with 11 failure assertions and 6 errors. Two failures independently reproduce using untouched original Python code: project-wide last-row assumption across multiple sources, and expecting an already-existing helper in a new diff. Other optional failures involve selected corpus/lexicon fixtures and morphology/provenance differences at ordinals 88/91; not all were individually baseline-rerun. No Python/engine/research changes were made. Standard Python passes 442 tests with 240 conditional skips. Local macOS/Node 25.9/Python 3.14 differs from CI Ubuntu/Node 24/Python 3.13.

## Preservation and evidence
Original `/Users/kian/code/pydicate-studio` remains clean at the verified head. Working tree is the writable isolated copy in this task. The relative patch passes `git apply --check` against the original. Corpus copy Git status remains unchanged; the engine copy retains exactly three pre-existing changes in grammar-navigation.md, annotation_audit.py and test_annotation_audit.py. No provider inference or live app/data access. Disposable PostgreSQL is stopped. No installer, release or deployment gate was run. Read `../pr16-review-summary.txt` for all standard/conditional/supplemental totals.

## Remaining questions / next prompt
Review the follow-up branch/draft PR; merge and deployment require separate authorization. Optional corpus/engine findings need separate bounded investigation with chosen fixture revisions. Suggested prompt: “Review the local PR #16 CI patch; keep merge/deployment separate from review.”
