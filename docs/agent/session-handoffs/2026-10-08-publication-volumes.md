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
passes 32 tests before the additional copy-failure test. Full operations discovery
ran 98 tests: one unrelated evidence-sync deployment mock attempted real SSH in
the sandbox and failed; its output contained no credential values. Do not rerun
that fixture with network authorization. Live scanner: oldtupicorpus 3 allowed,
nhe-enga 9 allowed / 466 skipped, private indexes unchanged.

## Remaining / next prompt
Finish the isolated private release rollout, run capture on both real volumes,
and record resulting publication/PR status. No grammar rule is changed here.
