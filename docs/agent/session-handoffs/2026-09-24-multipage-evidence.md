# Ordered PDF regions across pages

## Goal

Allow the passage `toîemonhang nde remimotara ybype ybakype oîemonhanga îabé`
to retain ordered crops from two pages and display its page coverage.

## Files inspected

Agent index, current state, repo map and open questions; `PdfEvidence.tsx`,
`evidence.css`, PDF browser harness/tests, evidence service, analysis capture,
image renderer and its tests, contributor guide. Existing storage already keeps
each region's physical page and explicit array order; capture preserves it.

## Files changed

- `src/components/PdfEvidence.tsx`: explicit next-page capture, coverage summary,
  ordered region list and reorder controls; page/view changes end active gestures.
- `src/evidence.css`: compact region row controls.
- `tests/pdf-evidence.spec.ts`: next-page capture, geometry preservation, page
  range, ordering/reordering, restart and analysis preparation regression.
- `electron/tests/evidence-images.test.cjs`: actual pixel capture preserves
  explicit reverse-page reading order.
- Current state, work log, contributor guide and this handoff.

## Commands and results

- `npx prettier --write` on the four changed code/test files: passed.
- `npm run typecheck`: passed.
- `node --test electron/tests/evidence-images.test.cjs electron/tests/evidence.test.cjs`:
  14 passed, including actual PDF pixel rendering and persistent service tests.
- `npx playwright test --config /private/tmp/pydicate-multipage.config.ts tests/pdf-evidence.spec.ts`:
  six passed in 18.7 seconds, using an isolated Vite server on port 5184.
- `npx vite build`: passed, with the existing large-bundle advisory.
- Scoped `npx prettier --check` and `git diff --check`: passed. Existing generated
  learning diff remains 24 additions/8 deletions; no regeneration performed.

## What worked / failed

The existing region schema, persistence and analysis image pipeline require no
migration or backend changes. Adding another region appends without replacing
earlier pages. Reordering changes saved region order without changing geometry.
Physical coverage compresses consecutive pages but lists gaps explicitly.

The first browser launch failed at the sandbox's localhost bind restriction
(`EPERM`); rerun used approved escalation for the temporary local Vite server.

## Remaining questions / limits

Printed pagination is independent of physical PDF coverage. Existing analysis
image limits (four regions) remain. No historical PDF, corpus passage, provider
request or native packaged app was modified/tested. Browser tests use actual
PDF.js rendering and the persistent evidence service with disposable vector PDFs.
Pre-existing uncommitted work and generated learning data were preserved.

## Suggested next prompt

“Capture the end of one page and the beginning of the next for this passage,
then inspect the two saved regions in reading order.”
