# Publication failures — 2026-10-08

## Goal
Repair `make collab-publish-all` without losing saved research or staging state.

## Inspected and changed
Inspected agent guidance, publication.py, host.py, ops.py, light.py, operations tests,
previous private rollout and preservation guard. Changed host.py, publication.py,
test_operations.py, current-state.md, log.md and this handoff.

## Findings
Root disk 49%, archive volume 52%. Live release 5ce7a30. EXDEV is an index
rename from the export volume into root-disk .git. Git 2.43 repeatedly segfaults
on nhe-enga `diff origin/main`; cached-base and working-index comparisons succeed.
Disabling rename detection, threading, preload or sparse config did not fix it.
Sparse Git may write the index despite GIT_OPTIONAL_LOCKS=0; the first probe did
so, and application UID/GID 1000 ownership was restored immediately. Subsequent
private-index probes preserved both live indexes byte-for-byte. No source reset.
The candidate union can conservatively include a path whose edits undo base
changes. Both rename paths are retained. Index-copy timestamps preserve Git's
racy-clean detection. Export index is copied/fsynced into the exclusively held
repository lock before ref update and the existing atomic install/rollback.

## Commands and validation
`python3 -B -m unittest discover -s scripts/collab/tests -p test_operations.py -v`
passes all 33 tests, including the copy-failure test. Full operations discovery
ran 98 tests: one unrelated evidence-sync deployment mock attempted real SSH in
the sandbox and failed; its output contained no credential values. Do not rerun
that fixture with network authorization. Live scanner: oldtupicorpus 3 allowed,
nhe-enga 9 allowed / 466 skipped, private indexes unchanged.

## Deployed and verified
Private release `7bd59ae985a45dbfcbd056cdd0a57503b66feb88` deployed with the
existing app-only guard. Health passed; 278 drafts, 2682 revisions, nine database
tables and all checked research/evidence/analysis bytes preserved. Verified
analysis archive and database checkpoint under
`light-backups/publication-volumes-20261008T143403-9d625c` and
`light-backups/20261008T143409-691bf5`. No credentials replaced or source reset.
The first bundle preparation used a wrong branch ref; it stopped before rollout,
then succeeded with the corrected ref and the same checksum-verified bundle.

`make collab-publish-all` then completed on the real separate-volume layout:
- oldtupicorpus: https://github.com/kiansheik/oldtupicorpus/pull/7
- nhe-enga: https://github.com/kiansheik/nhe-enga/pull/28

Both are unmerged review PRs. The existing local-export merge policy resolved a
conflict in `pydicate/pydicate/lang/tupilang/pos/deverbal.py` in favor of server
bytes and reported it in the PR. 466 out-of-allowlist candidates were skipped.
Post-capture checks preserved all 147 original workspace source files, UID/GID
1000 indexes, and no leftover index locks. The first failing diagnostic probe's
index metadata refresh was addressed by the private-index scanner; no staging
reset was performed. Raw operational logs remain private in /tmp and .local.

## Remaining questions / suggested next prompt
Review PRs 7 and 28, especially the reported deverbal.py conflict resolution;
merge with merge commits when approved. No linguistic rule was changed by the
Studio fix. Local code is on isolated branch `fix/publication-volumes`; root main
retains the user's unrelated dirty work and copies of the fix. No Studio source
was pushed to GitHub. The unrelated full-suite evidence-sync mock/network gap
remains; the focused publication suite is green.
