# Instant saved-work Git capture — 2026-09-30

## Goal

Remove `collab-publish-all` waiting for application maintenance and explain the
browser's repeated 503 responses. Capture what is saved when requested while
research jobs and the editor continue working.

## Inspected

Required agent guides; the supplied browser trace; publication/host/ops/light
helpers and operation tests; server idle, HTTP and bridge code/tests; analysis,
provider and parser work counters; previous publication handoff and design guide.
Production inspection was limited to the stalled export and maintenance state.

## Changed

- `scripts/collab/publication.py`, `host.py`: no-maintenance capture, content/mode
  verification, private index preserving sparse metadata, guarded ref update,
  rollback/recovery for index installation, and preservation of later edits.
- `scripts/collab/tests/test_operations.py`: forbid drain/stop calls, exercise
  live edits during capture, sparse flags, competing Git writes, failed index
  installation, executable-mode review hashes and existing export round trips.
- `server/public/bridge.js` and its pressure tests: maintenance 503 Retry-After
  pauses invoke polling; identical queued reads coalesce, writes never replay.
- `server/idle.cjs` and its tests: renew acknowledged leases; a lapsed lease
  checks active work before reacquiring.
- Agent state/map/log, design guide and this handoff. The previous fast-Git
  handoff remains a historical account of that release.

## Commands and results

- `python3 -m unittest discover -s scripts/collab/tests -p test_operations.py`:
  30 passed.
- `node --test server/tests/idle.test.cjs server/tests/bridge-pressure.test.cjs`:
  eight passed.
- `git diff --check`: passed before documentation updates.
- A disposable sparse Git fixture reproduced lost skip-worktree bits from
  replacing the index with plain `read-tree HEAD`; preserving the index fixes it.
- Cancelled only local export PID 63495 and its remote publish waiter PID 2761599;
  removed their exact maintenance request. Research jobs were not cancelled.
  Subsequent production idle state reported zero busy work.

## What worked and what failed

The browser trace is repeated maintenance **503**, caused by the previous export
using deployment's freeze-and-drain protocol. Removing that protocol from Git
capture addresses both the wait and the blocked browser calls. Source bytes saved
after capture remain uncommitted working edits; a change during capture fails with
a retry instruction instead of waiting for a job to finish.

The previous rollout verified deployed hashes and health but omitted live capture
after automatic approval rejected that smoke check. Its isolated tests mocked the
maintenance path, allowing the busy-server defect to escape. New fixtures reject
any drain call instead of making it appear successful. Independent review also
caught sparse-index metadata loss and ref/index failure recovery before release.

## Deployment and live verification

- Pushed `6258328650bab1224f91d0600b8cf314205aa2f3` to the existing Studio PR #16
  branch; `STUDIO_REF=unlocked-light-deploy make collab-deploy-light` completed
  in 14.6 seconds. Backup: `20260930T121943-ce3285`.
- Ran the explicit read-only `host.py changes` CLI action for both live repos:
  0.155 seconds corpus (no files), 0.330 seconds grammar (seven files). Both
  HEADs unchanged, no maintenance request, no container restart.
- Concurrent authenticated browser read-only smoke: 25 invoke responses,
  zero HTTP errors. Its route guard prohibited editing/inviting/AI starts.
- Resumed the user's interrupted `make collab-publish-all`: successful in
  12.68 seconds (log creation to final summary), including first filtered cache
  fill and GitHub PR creation. Corpus had no changes. Grammar exported 6,572
  bytes and opened https://github.com/kiansheik/nhe-enga/pull/20 without merging.
  The two excluded agent-note paths remained on the server.
- After publication: healthy container still started at
  `2026-09-30T12:19:44.792408933Z` (the rollout); maintenance absent, Git staged
  diff empty. Temporary verification artifacts were removed; real publication
  archives remain in private ignored `backups/`.

## Remaining questions

A saved-work snapshot may contain an unfinished repair;
capture is not editorial approval or a corpus-health assertion. Initial object
cache fill and GitHub requests remain network-dependent. Post-merge sync retains
its separate existing protections.

## Suggested next prompt

Review nhe-enga PR #20 normally. If another publication is slow, identify its
printed stage and separate capture time from network/cache/GitHub operations.
