# AI conversation history and readability

## Goal
Separate old failures from current analysis, add a fresh conversation action, and make streamed responses/tool activity readable.

## Files inspected
Agent index/current-state/repo-map/open-questions; analysis service/store/input; AnalysisSupport; analysis domain and styles; workspace browser fixture/tests; package scripts and Playwright config.

## Files changed
- `electron/analysis-service.cjs`: idempotent new-conversation command, archive-aware listing, original-thread result routing and input description summaries.
- `electron/tests/analysis-service.test.cjs`: archival, empty model context, idempotency and late-result regression.
- `src/components/AnalysisSupport.tsx`, `src/domain/analysis.ts`, `src/analysis-support.css`: new/history controls, latest exchange, formatted response, deduplicated readable activity and optional raw log; submission identity includes saved conversation.
- `tests/next-hook-harness.tsx`, `tests/analysis-workspace.spec.ts`: archive-aware fixture, fresh-chat/history/readability regression and explicit history navigation in existing tests.
- Agent current-state/log and contributor guide.

## Commands run
- Targeted Prettier over changed source/tests.
- `node --test electron/tests/analysis-service.test.cjs`: 14 passed.
- `npx playwright test --config /tmp/studio-chat-playwright.config.ts tests/analysis-workspace.spec.ts --reporter=line`: 12 passed.
- `npm run build`: TypeScript and production build passed.
- `git diff --check`.

## What worked
New conversations survive reload, archive without losing jobs/drafts, exclude prior turns from new immutable provider input and keep late results in the original thread. Existing request deduplication remains. Browser regression confirms single formatted response, one friendly dictionary step, hidden raw fragments and no generation from new/history actions. All provider behavior tested with fixtures; no paid generation or real profile changes.

## What failed
An initial browser run reused the existing port 5173 server and saw stale renderer modules, failing two assertions. The complete suite passed against a Playwright-owned isolated port 5197 server. The user's existing server was left alone.

## Remaining questions
Live linguistic response quality is not tested. Restart the desktop main process after the active analysis finishes to load the new command. Current provider-context reset preserves passage/draft/evidence context deliberately. History is archived, not permanently deleted.

## Suggested next prompt
Try Nova conversa and Histórico during normal passage work and review whether the latest-exchange view is easier to follow.
