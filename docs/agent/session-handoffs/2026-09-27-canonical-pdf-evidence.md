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
- `npx playwright test tests/pdf-evidence.spec.ts`: all 18 passed, including
  stale saved-cache replacement and actual unsaved-edit preservation.
- `.local/evidence-canonical/rehearse.cjs` uses a private disposable copy of live
  server evidence and the exact desktop PDF. Dry run and apply agree: 26 changes,
  exact region/view parity for all 26, repeat applies zero. Eighteen entries lose
  page 37; both user examples change from pages 37/38 to page 38.
- Initial tests exposed macOS's `/var` alias versus `/private/var`; checked reads
  now resolve the trusted root while still rejecting internal symlinks. One test
  invocation lacked its required disposable DB URL; rerun passed with it supplied.

## Remaining / next prompt

Two working copies reference historical passages; one current legacy buffer has
no baseline. Preserve all three originals for explicit review rather than guessing.
Original desktop files remain unchanged. Live deployment and verification results
will be recorded here after rollout.

Suggested next prompt: “Review the three historical PDF buffers that could not be
reconciled automatically.”
