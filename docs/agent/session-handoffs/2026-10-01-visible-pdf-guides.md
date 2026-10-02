# Visible-order PDF region guides

Goal: the gray previous-region guide must follow the displayed passage order,
including pending rows, administrator reordering/exclusion and corrected crops.

Inspected: `SourcePane`, `PdfEvidence`, evidence domain/autosaver, desktop
`next-service` and evidence service, hosted evidence context/bridge, PDF fixtures.
The old path used source ordinals/last visited rows and cached persisted guide
snapshots; an existing evidence record prevented a fresh predecessor lookup.

Changed: `SourcePane.tsx`, `PdfEvidence.tsx`, `domain/evidence.ts`, `evidence.css`,
`electron/evidence-service.cjs`, domain/evidence and filesystem evidence tests,
`tests/pdf-harness.tsx`, `tests/pdf-evidence.spec.ts`.

The source pane sends canonical evidence IDs in visible nearest-first order.
Status returns compact current owned crops/views and passage fingerprints for
those predecessors. The viewer derives its guide on every visit/order change,
ignoring stored guide chains and stale donor caches. Matching-baseline local
crops can guide the next passage while autosave is pending. Own crops and saved
viewports retain their existing guards. A cache-only `guideOnly` flag prevents
inherited non-default viewports from becoming empty owned evidence on revisit;
real region/view edits clear it. Fill/stroke opacity is modestly increased.

Validation commands: `npm run typecheck`; `npx vitest run
src/domain/evidence.test.ts src/domain/evidence-autosave.test.ts`; `node --test
electron/tests/evidence.test.cjs`; `npx playwright test --config
.local/dictionary-navigation.playwright.config.ts tests/pdf-evidence.spec.ts`;
targeted Prettier and `git diff --check`.

Worked: 15 domain and 17 filesystem evidence cases passed. The actual-PDF tests
cover saved/stale guides, edited predecessor regions, reordering/exclusion,
backward/forward navigation, delayed autosaves, deleted crops and no guide-only
writes. The final complete 29-case browser suite passed in 1.1 minutes.
One original coordinate-drawing check initially measured a 25-point offset and
passed unchanged on its narrow rerun; no assertion was weakened.

Limits: no production, corpus, neighboring repository or saved evidence mutation.
Legacy callers without visible-order context retain their old fallback contract.
Guide changes are refreshed by navigation/order changes, not by a polling loop.

Suggested next prompt: verify the deployed 118→119 guide after drawing/editing
118, then navigate backward and forward and check the visible donor identity.
