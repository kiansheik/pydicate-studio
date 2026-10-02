# Revision save identity and ordering race — 2026-09-30

## Goal

Fix administrator reservation failures and prevent revision publication from
duplicating or repositioning the same passage. Recover the reported live
`oîkotebẽba'emoapysyka` without discarding edits or changing unrelated order.

## Files inspected

Required agent guides; Store/HTTP/Studio/bridge publication and persistence paths;
useStudio, next-page, passage-organization; focused server/browser fixtures;
the reported live draft/source pair and its bounded revision/audit history.

## Confirmed cause

Live release `3aee95d` has reservations disabled. Same UUID
`41d6b8e2-c3e2-40be-8c76-24e9b3132b34` appears as canonical row 115 (source 113,
draft version 1) and pending row 119 (version 61), both without organization ranks.
Kian's single canvas unwrap saved at 21:31:12 UTC. Source publication succeeded
at 21:32:15; another browser persisted the newly canonical draft at 21:32:17,
before the publishing browser's pending-to-canonical cleanup. That races its
expected canonical version 0 and leaves both entries. Pending projection then
shows both identities; changing identity also loses pending-anchor ordering.

Canonical source contains the lexicalized form of Kian's latest edit. Comparing
both drafts, only identity/revision/time, source fingerprint, raw and canvas
differ; scholarly metadata is identical. No production research changes were
made during diagnosis. Bounded private evidence lives in ignored
`.local/vps-qa/revision-duplicate-evidence.json` and `revision-audit-read.json`.
Live independent evaluation confirms both stored expressions produce exactly
`oîkotebẽba'emoapysyka` with identical complete morpheme annotations. Fresh
health: 154 source lines, zero divergence/failures, eight pending, 321 morphemes,
no active repairs, 3.089s. The extra visible row is a draft lifecycle defect, not
a second source-file passage or grammar regression.

## Files changed / validation

`server/store.cjs` allows administrator reservation takeover using the current
database role and records former ownership. Genuine stale-version checks remain;
blind autosave overwrites would let an old browser undo newer work.

`server/publication-finalization.cjs` binds publication to the preview's saved
version/content and serializes source application and metadata migration before
the SSE notification. It retains editing metadata, retires the pending ID, remaps
anchors and freezes the existing visible order. `studio.cjs` owns these receipts;
`submission-review.cjs` consumes finalized versions and defers bulk notifications
until its outer transaction completes. Recovery is an explicit admin helper,
guarded by both versions, full-content hashes and unchanged canonical source.
No text-based deduplication or research-source rewrite is introduced.

`next-page.ts` and `passage-organization.ts` coalesce only the matching UUID and
retain its pending slot. `useStudio.ts`, `types.ts`, `draft-publication.ts` and
the hosted bridge adopt publication versions and acknowledge only refresh rows
whose complete draft baseline is still clean. Dirty sibling work retains its
old concurrency version; a dirty retiring pending draft stops refresh intact.
Desktop/local publication also keeps its existing visible order.

Browser regressions reproduce duplicate pending/canonical identities and lost
placement after publication/failed draft cleanup. Ordinary canonical revision
save already passes the no-duplicate/no-reorder control. Added
`tests/publication-identity-order.spec.ts`, domain identity/baseline tests,
`server/tests/publication-finalization.test.cjs` and focused core/HTTP/review cases.
PostgreSQL runs: 30/30 publication/core/review tests, 8/8 review/HTTP tests, then
12/12 final publication cases, including the Python serializer's outer whitespace
and multiline parentheses. Eighteen focused domain tests and the complete
11-case browser suite pass (13.2 seconds), including bounded source/draft refresh
retry and consumed-receipt assertions. Typecheck, syntax, formatting, diff and
production Vite checks pass.

Refresh snapshots that straddle publication retry once and then fail without
acknowledging mismatched identity state. Consumed migration receipts are removed
from retained project data so later no-diff reviews cannot replay them.

## Commands run

Targeted source reads/searches; git status/diff; narrow authenticated API and
read-only SQL audit inspection; isolated server tests and browser regressions.
Exact final checks/deployment/recovery results will be added below.
Disk preflight: 1.6 GB free. Removed only two confirmed-unused obsolete Studio
images (`7d5c2dcb`, `42158ebe`) and unused build cache, reclaiming 1.434 GB; 2.8 GB
free afterward. Running/recent rollback images, volumes, research and backups
were retained.

## What worked / what failed

Stable UUIDs distinguish a failed lifecycle transition from intentional duplicate
passages. Text equality must never be used to delete or merge separate IDs.
The original name-only search missed the published tree after lexical promotion;
following its UUID located the canonical counterpart exactly.

First release `9764cd4` deployed healthy in 63.2 seconds; checkpoint
`20260930T220025-0c508d`. Exact recovery preflight then stopped before any write:
the server's order calculation omitted a visible canonical row whose older
pending alias was explicitly hidden. Browser precedence correctly retained the
canonical organization metadata. The follow-up mirrors that precedence and
matches complete ID arrays for every live source (Araújo 119, Bettendorff 40,
Brasilico 2), with the target at 118. Twenty-one publication/review tests pass.
Two verified-unused oldest images (`78db33e`, `113c9aa`) were removed to provide
1.9 GB deployment headroom while retaining running/recent rollback images.

## Remaining questions

No required repair remains. Filesystem publication and database storage are
distinct resources; cross-resource failures retain the source journal and require
explicit recovery rather than claiming full atomicity. Navigator search currently
indexes title/ordinal/reference, not diplomatic transcription; the read-only smoke
used ordinal 118 after a transcription search returned no rows.

## Deployment and exact live recovery

Follow-up `865d7adbb738b867b9c0bd2e49021a32fb15455a` deployed in 14.7 seconds;
checkpoint `20260930T220554-f81bf3`. Running image and health verified independently.
The private recovery script copied the real identity registry into temporary
worker state, then checked versions 61/1, both complete-content digests and exact
source expression/fingerprint. Backup:
`/data/revision-recovery/41d6b8e2-1790805976873.json`.

The transaction changed seven metadata rows, retired pending version 62, and
produced canonical version 2 at visible position 118. It preserved every
unrelated passage's relative order and authored content, all source rows and
engine fingerprint, the original draft revision/canvas, and existing approval.
No grammar, source expression or generated reference was rewritten.

Authenticated API readback independently compared the complete expected ID list,
all unrelated authored-content hashes and every source row. Output remains
`oîkotebẽba'emoapysyka` with identical complete annotations. Fresh health: 154
lines across three sources, zero divergences/failures, seven pending, 321
morphemes, no active repairs, 2.646s.

Real Chrome finds exactly one row at 118 and the expected tree output. Twenty
authenticated invokes had zero HTTP/page/invoke errors and no attempted research
mutations; the prior selection was restored. Screenshot inspected at
`.local/vps-qa/revision-recovery-browser.png`; private sanitized evidence is in
`revision-recovery-result.json` and `revision-recovery-browser-result.json`.
The test-owned PostgreSQL instances are stopped and their temporary directories
removed; other local services were untouched.

## Suggested next prompt

Recheck simultaneous publication/save/reopen with existing administrator order;
verify one stable passage and unchanged neighboring order.
