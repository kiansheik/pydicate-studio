# Submission feedback and checked batch review — 2026-09-30

## Goal
Visible invitation/submission feedback; persistent review status and admin filters.
User clarified that bulk publication must show engine results and PDF screenshots,
let the admin compare line by line and publish only explicitly checked entries.

## Inspected
App/navigation/workflow; bridge/panel; HTTP, submission/store/database services;
source previews/publication and reference guards; PDF evidence/coordinates;
existing reference-publication and submission fixtures.

## Changed
- `server/public/panel.js`: adjacent persistent feedback, disabled sending buttons,
  Portuguese submission labels and initial list load.
- `server/submissions.cjs`, `src/domain/submissions.ts`, App/bridge/types:
  project/revision/source/ordinal summary, paginated latest-status lookup,
  cross-source filters, submitted button/status, pending/canonical aliases.
- `SubmissionReviewQueue.tsx`, `SubmissionPdf.tsx`, associated CSS: admin dialog,
  result/transcription/translation and rendered PDF crops or a chosen physical
  page, expandable lexical/source differences, unchecked-by-default approvals,
  selected sequential publication in displayed passage order. Checkboxes require
  successful PDF rendering. No AI, production invites or publication in QA.
- `server/submission-review.cjs`, studio/http and useStudio: per-row receipt bound
  to admin and browser tab, 30-minute expiry, current saved submitted revision,
  latest submission, current source, fresh engine result, lexical metadata and
  PDF geometry/content identity. Re-prepares after earlier rows change file offsets;
  changed review content requires rechecking. Holds the runtime engine queue and
  the existing metadata write lock during each final check/publication. Existing
  Python atomic source/regression and exact human-surface reference guards remain.
- Adopts returned shared envelope/versions/project; pending IDs and sibling insertion
  pointers become canonical; only successful references mark submissions imported.
  A failed reference write reports partial source publication and stops the batch.
  Snapshots/events remain immutable. A chosen page without crops is recorded in the
  review event, never invented as an authored saved crop.
- Focused unit/integration/browser tests and agent docs.

## Commands / results
Disposable local PostgreSQL at port 55439, separate test schemas; no production DB.
`node --test server/tests/submissions.test.cjs server/tests/bridge-pressure.test.cjs`:
9 pass. HTTP transport plus initial bulk review tests: 6 pass. Updated bulk review
suite including canonical pending publication: 6 pass.
`npm run build:app`: passes, existing chunk-size warning.
Real browser test uses copied local grammar and three synthetic source lines.
It renders actual PDF landmark pixels, checks two rows sharing a source, publishes
those two with references, and confirms the unchecked source/draft is unchanged.
Invitation sending/success and submission feedback survive later save events;
SMTP is stubbed. Passed in 19.1 seconds at 800x600; screenshot inspected.
Initial fixture runs needed expectedRevision=0 for attachment and explicit compact
Passagens pane navigation; those failures did not touch production.

## Remaining questions / limits
Deployed bb1ad75bd966e4aa488d09b88927083cea7d7fc1 in 50.8 seconds. Live read-only queue/filter verification passed; no lines automatically approved. All 25 mounted controls opt out of autofill; login remains intact. Fresh corpus health: 151 lines, zero divergences/failures, 2.492 seconds. Browsers may ignore autofill hints;
that prior fix is live and DOM verified. Receipts are process-local and expire;
reopening/rechecking after deployment is required. Each selected line is its own
publication; this is not an all-or-nothing cross-filesystem/database transaction.
Disk/database failure after a source write still needs the existing recovery
journal; do not claim universal crash atomicity. No automatic Git push/merge.
The PDF fixture verifies pixels/geometry, not interpretation of historical scans.

## Suggested next prompt
Use the new queue with real contributor submissions; compare the PDF and result,
check only accepted lines, then incorporate those selections.

Final combined run: all 17 focused server/transport/submission tests passed,
including the real browser/engine/PDF flow (18.9 seconds). Production build and
diff checks passed. Batch preparation serializes per dialog to avoid request
bursts. Readable source/line labels and publication follow the displayed order.

Disposable PostgreSQL stopped after validation. The initial push was rejected by
automatic review for unverified destination; read-only remote/PR checks confirmed
the same existing kiansheik/pydicate-studio PR #16 branch, and the exact push was
then approved. No main merge or automatic live contribution publication.

Live QA found that the queue could open before its initial listing arrived. The
filter and queue now wait for the current project listing. A held-response real
browser regression confirmed disabled controls until loading finishes, then the
entire selected-only publication flow passed again (18.8 seconds).

Loading follow-up deployed as 42158ebea7a008ea3cad106c28b862c657103d64
in 50.5 seconds. Disposable PostgreSQL stopped again after its regression test.
Final read-only production check passed: three submitted records reduce to two
latest passage entries in the queue, with zero automatic approvals; all 25 mounted
controls still opt out of autofill and login tokens remain intact.
