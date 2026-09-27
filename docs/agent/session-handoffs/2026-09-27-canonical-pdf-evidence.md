# Canonical desktop PDF evidence

## Goal

Restore the user's persisted manual region corrections as active evidence,
particularly Salve Rainha passages 18/19, and prevent stale browser caches or
future deployments from reviving deleted page-37 boxes.

## Inspected / cause

- Desktop evidence manifest revision 130, its 29 persisted browser PDF buffers,
  the verified research archive and a read-only live server evidence snapshot.
- `evidence_sync.py`, `desktop-import.cjs`, `desktop-storage.js`,
  `evidence-service.cjs`, `PdfEvidence.tsx` and evidence models/tests.
- The old restoration copied saved manifests and archived newer working copies.
  Their exact baselines prove the manual corrections; preserving the old manifest
  was not preservation of the state the user actually saw on the desktop.
- An unchanged browser cache could also shadow a corrected server manifest.

## Changed

- `server/desktop-evidence-import.cjs`, importer integration and service validator:
  checked archive bytes, exact source/passage/PDF identity, baseline comparison,
  authoritative removals, normal atomic evidence saves and content-based receipts.
  Repeated snapshots cannot replay corrections over later online edits.
- Evidence cache reconciliation and focused browser/domain/recovery tests.
- Agent state/map/log and deployment documentation.

## Commands / results

- `node --test` for evidence service (11 passed) and desktop recovery/import/
  storage (16 passed with disposable PostgreSQL on port 56544).
- `npx vitest run src/domain/evidence.test.ts`: 8 passed.
- `npx tsc -b`; formatting and `git diff --check` passed.
- `npm run build:app`: production build passed without changing generated corpus files.
- `npx playwright test tests/pdf-evidence.spec.ts`: all 18 passed, including
  stale saved-cache replacement and actual unsaved-edit preservation.
- `.local/evidence-canonical/rehearse.cjs` uses a private disposable copy of live
  server evidence and the exact desktop PDF. Dry run and apply agree: 26 changes,
  exact region/view parity for all 26, repeat applies zero. Eighteen entries lose
  page 37; both user examples change from pages 37/38 to page 38.
- Initial tests exposed macOS's `/var` alias versus `/private/var`; checked reads
  now resolve the trusted root while still rejecting internal symlinks. One test
  invocation lacked its required disposable DB URL; rerun passed with it supplied.

## Live rollout

- PR #11 merged as `d711aba002b65cdda82292f45d0d8ba667fd5812` and ordinary
  `make collab-deploy` succeeded. New snapshot
  `1ade13f8a13ca76f6511c7cd14a1215c95333c7c3fccfc8cdcfe66d34699f901`
  retained all original research. Import changed zero passage drafts, kept three
  current lexical notes unchanged, and applied exactly the rehearsed 26 PDF
  corrections. Three historical/legacy buffers remain archived as explained below.
- Backup `predeploy-20260927T180038-ea1b34`: independently verified SHA-256 for
  `database.dump` and `workspace-state.tar.gz`. The service is healthy, publication
  receipt verification passed, and both dependency revisions remain unchanged.
- `.local/evidence-canonical/live-verification.json`: exact region/view parity for
  all 26 corrections, 18 page-37 removals, 86 unrelated evidence entries unchanged,
  managed assets unchanged, all draft data unchanged and 26 durable receipts.
- Live Chrome report
  `.local/evidence-canonical/browser-verify-2026-09-27T18-03-08.244Z.json` passed:
  both Araújo 18/19 show only the page-38 crop despite seeded old page-37 caches;
  all 105 completion labels, prayer field and actual Bettendorff PDF/crop pixels
  remain correct. No content writes, queue/external requests or browser/API errors;
  original selection restored and all active draft/evidence hashes unchanged.
- PR hosted CI passed; full browser CI was still running at the last check.
  The disposable local PostgreSQL cluster was stopped after its tests passed.

## Remaining / next prompt

Two working copies reference historical passages; one current legacy buffer has
no baseline. Preserve all three originals for explicit review rather than guessing.
Original desktop files remain unchanged. The missing-baseline buffer is the old
first-passage browser copy; its current online crop was preserved. The other two
copies have no proven current passage match.

Suggested next prompt: “Review the three historical PDF buffers that could not be
reconciled automatically.”
