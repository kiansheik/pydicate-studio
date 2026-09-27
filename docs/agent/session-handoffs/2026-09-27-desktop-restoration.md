# Desktop research restoration and passage continuity

## Goal

Restore all persisted pre-refactor research before further authoring, including
the desktop's explicit completion states; preserve existing online contributions.
Also carry location/PDF guide and editable text into an empty next passage, with
an optional prayer name.

## Inspected

- Desktop profile inventories, draft/analysis/notebook stores, browser key
  callers, read-only project/source fingerprints, existing deployment bundles.
- `ops.py`, `host.py`, `evidence_sync.py`; hosted store/revision schemas,
  HTTP/auth/runtime policy and source/evidence frontend behavior.
- Active hosted aggregate counts and immutable-history hashes (no content or
  credentials in reports); the source of the discrepancy was missing migration.

## Changed

- `desktop_sync.py`, `read_local_storage.cjs`, deployment wiring and tests:
  deterministic allowlisted research archive, isolated browser extraction,
  checksum/path validation, import after checkpoint and migrations.
- `server/desktop-import.cjs`, migration 004, notebook importer, history reader
  and administrator viewer/storage recovery; authenticated routes and regression
  coverage. AI history inspection never creates or resumes provider services.
- Passage/context/locator models, editor controls, source metadata round-trip,
  PDF guide fallback, pending/existing-empty passage flow and targeted tests.
- Deployment/design documentation and agent wiki.

## Commands and validation

- Python deployment archive/release/operations tests.
- Collaboration tests with `COLLAB_TEST_DATABASE_URL` pointing at disposable
  PostgreSQL on port 56544; every test uses an isolated random schema.
- Actual private desktop snapshot restoration with simulated different hosted
  IDs/fingerprints: 1,166 field comparisons, frontend validation/restoration,
  105 current Araújo complete flags, 137 current drafts, 22 orphan archives,
  one pending draft, 30 canvases, nine explicit stale fingerprints.
- Original desktop Local Storage files remain byte-identical. Allowlisted
  exported data includes 29 PDF buffers (30 regions), 14 historical retry
  records, last-passage pointers and interface preferences. No saved learning
  progress or lexical-note buffers were present at inspected origins.
- Sanitized input snapshot: 202 files, 107,494,830 bytes;
  SHA-256 `f26e0b2bf76a0164f71d78be3f0731b262778c75f86541d15bbd4a06c9161fe6`.
  Managed PDFs travel in the existing separate exact-byte bundle.
- Final local checks: production build and formatting; 60 deployment tests;
  compiled hosted contributor source/PDF/crop/save/restart/submission workflow;
  28 passage-domain and 13 desktop persistence/validation tests; 25 passage/PDF
  browser scenarios; three administrator history/recovery browser scenarios.
  Prayer create/edit/clear/reopen passed against a disposable corpus copy.
- Real notebook recovery restores three current notes, including a declaration
  whose only change was formatting (verified by same-runtime AST and comment
  fingerprints). Four occurrence notes reference historical passages and retain
  their complete original histories for review.

## What worked / what failed

Draft restoration and repeat-import protection passed real-data checks. Hosted
completion had been absent because `Store.seed` creates source defaults, not
because the local work was deleted. Exact-file identity avoids Python-version
fingerprint differences. A broad initial local allowlist also included a nested
legacy provider-config filename; this was caught before any transfer and narrowed
to hashed request paths with a regression test. Only the sanitized archive is
eligible for deployment. PostgreSQL tests required sandbox escalation for the
loopback socket. One existing schema-count assertion required updating for the
new fourth migration; the schema-integrity test then passed.

## Remaining questions / next prompt

Historical records without a provable current source/lexical occurrence remain
visible for review instead of being attached by guesswork. In-memory undo stacks
and tab-specific Session Storage are not recoverable authoring histories through
this migration. Browser-only PDF buffers are restored explicitly to the owner's
browser without replacing newer local buffers. Deployment/production verification
results will be added here before completion.

Suggested next prompt: “Review the restored desktop history and resolve any
historical source links that should become current passages.”
