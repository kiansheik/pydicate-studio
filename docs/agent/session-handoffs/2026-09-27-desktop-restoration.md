# Desktop research restoration and passage continuity

## Goal

Restore all persisted pre-refactor research before further authoring, including
the desktop's explicit completion states; preserve existing online contributions.
Also carry diplomatic/revised readings, translations, analysis instructions,
location fields (including the exact textual line) and the previous PDF guide
into an empty next passage, with an optional prayer name. Existing next-passage
work, analysis trees and editorial approval remain separate.

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
- Sanitized rehearsal snapshot: 202 files, 107,494,830 bytes;
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

## Verified live deployment

- PR #9 merged as `6ceb2cbe29e657b578ffdbc4868f5b711db297cd` and
  `make collab-deploy` completed successfully. Final PR head
  `94508a9a30440d6a457cd3119ee21b79695ea918` and both merged-main workflows
  passed. The browser suite finished with 205 passed, 102 optional skipped and
  zero failures; `gh pr checks 9` and the main workflow results were verified.
- Actual deployed archive:
  `2b8564d3ca19da674603b75f866200b626fa085d23300c17548dc3cc42882c2f`;
  every SHA-256 verified across 202 files / 107,494,830 bytes. Backup
  `predeploy-20260927T172802-e9668f` has verified hashes for both `database.dump`
  and `workspace-state.tar.gz`.
- Live parity: 1,167 field checks, zero skipped conflict fields; 105 current
  Araújo completion flags, 137 mapped drafts, one pending draft, 22 historical
  drafts and 30 canvases. Nine stale fingerprints stay explicit; zero draft
  conflicts. Three lexical notes are active and four retain historical linkage.
  All 67 preexisting revisions, one comment and one submission retained exact
  hashes. Reports: `.local/desktop-migration/live-verification.json` and
  `backup-verification.json` in the same private directory.
- Read-only browser smoke passed:
  `.local/desktop-migration/browser-verify-2026-09-27T17-34-01.712Z.json`.
  It verified 105 completed current passages in the API/sidebar, the completed
  filter's 106 entries including the pending passage, the prayer field,
  preserved conversation/draft details, and actual Bettendorff PDF pixels plus
  its saved crop. No paid-analysis polling, content writes, external requests,
  browser errors or API errors occurred. Original selection was restored;
  draft and evidence hashes were unchanged.

## History readability follow-up

Separate commit `c4732a5` improves `server/desktop-history.cjs` and
`server/public/desktop-history.js`, with regressions in
`server/tests/desktop-history.test.cjs` and `tests/desktop-history.spec.ts`:
individual revision numbers, saved-expression fallbacks, rationale and annotated
results are directly readable. The actual archive already exposes all 73
candidate revisions individually. Six reader tests and four browser tests pass;
the 73-record regression also covers pagination, stable identities and exact
original downloads.

PR #10 merged as `4602f5749bc83ba3987999752bd1491fd66d2476`. Deployment through
`Remote.prepare_release` / `Remote.deploy_release` succeeded using the already
verified server archive, without uploading or importing it again. The service
is healthy and publication receipt verification passed. Both files in the new
backup `predeploy-20260927T173928-3e8a87` were independently rehashed; dependency
revisions remain unchanged. Private logs/reports: `deploy-history.log` and
`history-backup-verification.json` under `.local/desktop-migration/`.
The task's disposable PostgreSQL cluster on port 56544 was stopped cleanly.

Final live parity repeated all 202 file checks, 1,167 field comparisons and
preexisting history hashes successfully (`history-live-verification.json`).
The isolated read-only Chrome check
`browser-candidate-history-2026-09-27T17-41-58.083Z.json` passed pagination
(50 + 23 = 73 unique numbered revisions), an actual evaluated revision's exact
expression/rationale/annotated result and original download availability.
Selection and the complete draft hash stayed unchanged, with no blocked requests,
browser errors or API failures.

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

The only general CI failure was the old `sources.spec.ts` expectation that a
new passage's transcription stay blank. It now expects the requested inherited
reading; all three focused source browser tests and the final CI suites pass.
Two initial live-QA assumptions were corrected without application changes:
the completed filter includes one completed pending passage (106 total), and
the collaboration panel must be opened before its history button is visible.

## Remaining questions / next prompt

Historical records without a provable current source/lexical occurrence remain
visible for review instead of being attached by guesswork. In-memory undo stacks
and tab-specific Session Storage are not recoverable authoring histories through
this migration. Browser-only PDF buffers are restored explicitly to the owner's
browser without replacing newer local buffers. The source profile and complete
allowlisted original archive remain preserved.

Suggested next prompt: “Review the restored desktop history and resolve any
historical source links that should become current passages.”
