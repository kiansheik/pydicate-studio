# Fast original PDFs and idle dependency updates — 2026-09-27

## Goal

Make hosted PDF navigation responsive without reducing handwriting quality, retain
visited bytes locally for a week, and automatically track published oldtupicorpus
and nhe-enga updates when idle with a backup. The user explicitly selected
automatic idle updates with backup. Continuing authorization includes merging
and deploying the collaboration fixes.

## Files inspected

Required agent index/current state/repository map/open questions; PDF viewer,
evidence schemas, desktop evidence/next services, hosted bridge/runtime/HTTP,
PDF fixture and browser tests, collaboration host/ops/compose/dependency pins,
existing deployment and source-workflow tests. Private live baseline script and
reports are under `.local/vps-qa/`; credentials and actual PDFs remain ignored.

## Files changed

- `src/components/PdfEvidence.tsx`, `src/domain/{types,pdf-document}.ts`: reuse the
  current source PDF; load checked 64 KiB original-byte ranges; IndexedDB cache
  scoped to account/project/source/SHA/size, fixed seven-day expiry, 256 MiB LRU,
  corruption/storage failure fallback, bounded stalls and retry.
- `electron/{evidence-service,next-service}.cjs`: internal verified open handles,
  bounded SHA checks and stat-based verification cache; existing desktop API.
- `server/{pdf,idle,http,studio}.cjs`, `server/public/{bridge,panel}.js`: authorized
  range streaming/HEAD, cancellation cleanup, idle heartbeat/maintenance lease,
  update status and explicit reload prompt.
- `scripts/collab/{host,upstream}.py`, deployment README/dependency pins: timer,
  clean public-origin fast-forwards, checkpoint before changes, guarded restart,
  current dependency pins. Never resets/stashes/discards dirty or diverged work.
- Desktop PDF fixture/tests; server PDF/HTTP/source/idle tests; new browser cache
  harness/spec; PDF evidence regression tests; updater tests and agent docs.

## Commands run and results

- `npm run typecheck`, `npm run build:app`: pass.
- `npx playwright test tests/pdf-evidence.spec.ts tests/pdf-cache.spec.ts
  --output=test-results/pdf-final`: 19 passed, including original pixels,
  same-source reuse, persistent reload/next-day cache, expiry, account isolation,
  corruption, unavailable storage, bounded eviction, stalled transfer retry,
  source switching and exact saved crop geometry.
- Desktop evidence/crop checks: 16 passed.
- Authenticated HTTP/range/revocation and streaming-abort checks: pass against
  disposable PostgreSQL at localhost:56544. Source upload/restore test passes
  with `COLLAB_REAL_PROJECT=/Users/kian/code`.
- `COLLAB_FULL_EDITOR=1 ... node --test server/tests/source-workflow.test.cjs`:
  compiled real-editor source/PDF/crop/restart/submission workflow passed using
  disposable copies and local Chrome. Neighboring repositories remain clean.
- Updater: 10 focused real-Git/mock-host tests passed; the complete operations
  suite passed 47 tests before the final two recovery/control cases were added.
  HTTP/idle/PDF checks: four passed, including private lease expiry, dirty-work
  preservation, failed-checkpoint restart and passive session-expiry behavior.
- Targeted formatting and `git diff --check`: pass.

## What worked

Live baseline confirmed the actual 84,734,099-byte scan downloaded again on every
passage change. Guide 17 to passage 18 took about ten seconds on a fast connection;
transfer alone would take about 68 seconds at 10 Mbps. The new implementation
keeps original data and requests only needed ranges instead of rasterizing scans.
Public upstream and local clean HEADs match: oldtupicorpus
`e707610a9f69a7b336c80f096a67e9a4ee0e4dfe`, nhe-enga
`c43c83ec6079b7747d39dbca3e2f577023665916`.

## What failed and was corrected

An initial large test PDF used a giant comment, which legitimately forced parser
scanning; replaced it with a valid unreferenced stream and recomputed xref. Pixel
assertions now wait for actual canvas pixels during asynchronous passage rendering.
An initial source-test invocation pointed COLLAB_REAL_PROJECT at the corpus
instead of its parent; corrected invocation passes. The full editor test requires
COLLAB_FULL_EDITOR, not COLLAB_BROWSER_TESTS; it was rerun explicitly and passed.
Independent review fixed root-created operations-directory ownership and ensured
systemd termination reaches updater cleanup/restart.

## Live rollout

Pending final deployment and live measurements; append verified results here.

## Remaining questions

Browser storage may be evicted by the browser/OS or cleared by the user; exact
network ranges are the fallback. Cached pages still require a current authorized
source status, and complete offline editing is outside this change. Arbitrary
new upstream code can fail compatibility; backups and health/state reporting
preserve recovery evidence, while dirty/diverged repositories require maintainer
reconciliation. No ground truth is automatically approved.

## Suggested next prompt

Exercise the live contributor demo using another source PDF; inspect any remaining
slow interaction with network timing and verify its exact saved evidence rather
than regenerating source or ground truth.
