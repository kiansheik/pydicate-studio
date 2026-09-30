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

## Remaining questions

Deployment and live capture verification are pending. Root will append exact
release/timing evidence. A saved-work snapshot may contain an unfinished repair;
capture is not editorial approval or a corpus-health assertion. Initial object
cache fill and GitHub requests remain network-dependent. Post-merge sync retains
its separate existing protections.

## Suggested next prompt

Deploy the tested capture fix, verify it on the live server without interrupting
research, and record capture timing separately from GitHub/cache/network time.
