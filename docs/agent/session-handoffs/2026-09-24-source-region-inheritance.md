# Prevent copied predecessor regions

Goal: a marked passage may have multiple own images, but opening an unmarked existing successor must not acquire those images as its own source evidence.

Files inspected: `PdfEvidence.tsx`, `domain/evidence.ts`, their tests, the evidence service, PDF harness and design contract. The old ordinary path called `inheritEvidence`, cloning every donor rectangle under fresh IDs; pending entries already used a separate guide.

Files changed: `src/components/PdfEvidence.tsx`, `tests/pdf-evidence.spec.ts`, PDF design contract, current state, log and this handoff. The ordinary path now calls `guideEvidence`. Existing saved/cached entries are preserved. No live user-data writes or migration took place.

Commands run in the isolated qualification build copy: `./node_modules/.bin/playwright test --config playwright.region.config.ts tests/pdf-evidence.spec.ts` (8 pass), `./node_modules/.bin/vitest run src/domain/evidence.test.ts` (5 pass), `node --test electron/tests/evidence.test.cjs` (10 pass), `./node_modules/.bin/tsc -b` (pass). The temporary browser config uses port5194 and cannot reuse a running author's server.

What worked: genuine multiple-page evidence survives save/restart/reordering. An existing unmarked successor has zero own regions before drawing, including after evidence preparation; its own newly drawn box survives restart, and its predecessor's two boxes remain unchanged.

What failed: first sandbox attempts could not write a symlinked dependency cache or bind localhost. A local dependency-cache directory and approved isolated test server resolved these. The new test initially assumed the last box was still selected after saving; it now explicitly selects the second region before testing the donor view. Final checks passed.

Remaining questions: historical copied regions already saved are not reliably identifiable by duplication alone. The qualification has a separate exact-region, source-reviewed export disposition ledger. Applying this patch does not alter those saved rectangles. Native Electron usage has not been manually retested here.

Suggested next prompt: review the hash-guarded patch, then validate existing and pending passage navigation in the desktop app; keep old user evidence intact and correct any historical copied region only after source review.
