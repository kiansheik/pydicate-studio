# Hosted grammar repair

## Goal

Make the user's saved hosted correction edit the selected grammar, verify the
result and automatically refresh the UI as desktop does. Preserve saved input,
research, PDF evidence and human review state.

## Inspected

Provider/analysis service and MCP gateway; grammar-repair tools; hosted runtime,
AI authorization and browser bridge; deployment sparse checkout; analysis UI.
Narrow production job/thread diagnostics and the prior investigation handoff.

## Changed

- `electron/provider-codex.cjs`, provider tests and `scripts/check-codex-tools.mjs`:
  exact Studio guide resource compatibility, bounded rejection identity, errors.
- `electron/grammar-repair.cjs` and tests: truthful contained file discovery.
- `scripts/collab/host.py` and deployment tests: additive sparse support after backup.
- `src/domain/analysis.ts` and tests: completed/failed activity labels.
- `server/tests/grammar-reload.test.cjs`, hosted CI: actual browser repair flow,
  real Python edit/reload, automatic rendered output update, unchanged research.
- Agent current state/log and this handoff.

## Commands and results

- `npm run build`: passed.
- `npm test`: 251 passed.
- `python3 -B -m unittest discover -s scripts/collab/tests -p test_operations.py`:
  15 passed, including dirty sparse checkout preservation.
- Focused provider/MCP tests: 69 passed; grammar-repair tests: 8 passed.
- `npm run test:codex-tools`: installed Codex with isolated fake API passed
  guide access, all six grammar tools and tool-error recovery. No paid inference.
- Real PostgreSQL/Python compiled editor test: passed in 18 seconds with installed
  Chrome, changing disposable abá to kunhã via actual correction dialog and SSE.
- Hosted service suite on disposable PostgreSQL: 65 passed, 7 optional skips.
- `npm run test:desktop`: 284 passed. `npm run format:check`: passed.
- Build regenerated local learning data from neighboring docs; restored that
  generated file to HEAD, keeping this change scoped.

## What failed and remaining questions

The first broad CI browser run passed 209 tests and failed one outdated
activity fixture that marked a completed job with only tool-start events. Updated
it to include completed dictionary results and a failed grammar read, retaining
dedup/history assertions and adding truthful failure-label assertions. All 19
analysis-workspace browser tests pass after the fixture correction. Hosted CI,
including the full compiled repair flow, passed.

Original missing guide alone did not reproduce the fatal error; the rejected
historical tool identity remains unknown. Standard resource-helper access does
reproduce the same failure class. Foreign servers/resources remain forbidden.
The initial browser fixture required installed Chrome because bundled Playwright
Chromium was absent. Production deployment and exact saved-job resume remain.

## Suggested next prompt

Complete release checks, deploy with verified backup, resume the saved repair and
verify live edits, result/UI refresh and research preservation. Record the exact
release and final attempt outcome here.
