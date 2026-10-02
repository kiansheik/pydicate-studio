# Insertion blocked by unrelated references — 2026-09-30

## Goal

Fix the live error `Referência sem passagem correspondente; concilie antes de inserir.`
when reviewing pending passages for source insertion.

## Inspected / changed

Inspected `passage_insertion.py`, `passage_references.py`, adapter identity registry,
source_new_preview/_preview/publication_regression, App/useStudio save workflow,
next-page insertion anchors and existing order/reference tests. Live inspection
exported only passage/source IDs, ordinals and insertion anchors, no draft text.
Changed insertion's unchanged-record fast path, added
`python/tests/test_passage_insertion.py`, updated current-state/log/this handoff.

## Findings

Araújo reference 55 retains aff969f1-a8f7-4646-abdb-084e88e50ff0 while its source row
currently resolves to df47ef1d-8b28-46db-957f-59b883498771. Reference 60 retains
438841ce-2b74-49a1-9ca9-3deb844a4958 while the source row resolves to
4dcde0f6-74e2-454c-886d-97faaf03ff9c. Neither source row had an explicit passageId.
All other saved reference identities align. Actual pending insertion targets are
after both disagreements (including canonical source ordinals72 and113).

The old guard checked every record, including unchanged earlier ones. The fix
retains these records unchanged before checking identities of rows that shift.
Old review IDs and editorial content are never reassigned. Plain draft saves were
not failing through this path; source review persists the draft before previewing.
A clean surface-based corpus health report did not establish identity consistency.

## Commands / what worked

- Seven focused Python reference/insertion tests pass, including exact legacy
  bytes, sparse gaps, preserved disagreement and rejected shifted mismatches.
- Existing actual-engine duplicate insertion/reference regression passes (8.46s).
- Original HEAD reproduces the failure in the regression fixture.
- Read-only in-memory production probe: original code fails at both targets 72/113;
  patched function succeeds, JSONL records 55/60 stay byte-identical, all original
  live source/reference files remain unchanged.
- `git diff --check`: clean.

## What failed

An initial diagnostic proposal to export full authenticated project/draft payloads
was rejected by automatic approval review. It was replaced with an explicit
metadata-only allowlist; no full research payload was exported. An API wrapper
mistake first reported no pending drafts; corrected to snapshot.envelope.drafts.

## Remaining questions

The two older identity disagreements remain unresolved and preserved. Insertion
that would move a mismatched/orphan reference still refuses to guess association.
The source insertion path pins current source identities as before; it does not
silently approve old records. Separate identity reconciliation would require
registry/history evidence, not equal generated surfaces. No AI or approval was
requested or performed by diagnostics.

## Suggested next prompt

Retry the same pending passage's source review; investigate the two older identity
disagreements separately only with evidence linking their original UUIDs.


## Rollout / verification

Committed/pushed `0c67322f489f15cff0841b7157d68d42e93111eb` on existing
unlocked-light-deploy; `STUDIO_REF=unlocked-light-deploy make collab-deploy-light`
passed six rollout checks and deployed. Full live `source_new_preview` checks
used the saved drafts entirely in process memory (no exported draft text):

- pending:61fb0b24-cd26-4a1d-b8b2-312df096770d, before source 72.
- pending:bee213e2-53a1-4844-aac7-9dd6e6acf8ab, before source 113.

Both previews succeeded with regression `{ok:true, checked:155, changed:1,
references:153, baselineIssues:0, pendingReferences:0, failures:[]}`. No source
apply, draft save, reference approval, or provider request was performed. Exact
before/after parity covers 145 research files and six evidence/PDF files.

Deployment was 141.3s because image creation filled the disk, stopping the private
idle heartbeat. Removed only unused old Studio images 1bb0c22,a784d1c,bb1ad75,
6258328,020f0ea,e5852d8 after checking no container references (no force). Current,
candidate and recent rollback images remain; no volumes, corpus, PDFs, credentials
or backups were deleted. Free disk recovered to 2.6 GB and deployment acknowledged
normally. Check capacity before the next build; a low-space deployment preflight
is not part of this narrow insertion change. Backup: 20261001T005124-82a601.
