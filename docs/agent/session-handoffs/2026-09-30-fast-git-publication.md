# Fast Git contribution publication

## Goal
Make `collab-publish-all` proportional to the small contribution, without repeatedly
restarting Studio or changing its running grammar while preparing a PR.

## Inspected
`host.py` collect/changes/ownership/merge, `ops.py` export/clone/push,
`light.py` drain, `server/idle.cjs`, operation/rollout tests, Make targets and
collaboration docs. Live helper SHA, container start time, existing export sizes,
and exact saved export base/head IDs were read without exposing research content.

## Changed
- `scripts/collab/host.py`: maintenance-leased capture/commit; restore ownership
  only under `.git`; incremental bundle outside lease; `publish-current` action.
  Upstream merge helper is callable on the isolated laptop checkout.
- `scripts/collab/ops.py`: one capture/download per repository; partial upstream
  object cache, shared sparse checkout, lazy file fetch, local upstream merge.
  Historical complete bundles remain readable. Review hashes/allowlists remain.
- `scripts/collab/light.py`: operation-specific maintenance progress text.
- `scripts/collab/tests/test_operations.py`: real Git round trips, new/deleted
  paths, no stop/start, active-work rejection, post-snapshot edits, local-only
  merge, partial/sparse large-asset exclusion and one automatic capture.
- Make help, design guide, agent state/map/log and this handoff.
- Prior submission-review handoff contains the previously verified rollout notes.

## Commands and results
- `python3 -m unittest discover -s scripts/collab/tests -p test_operations.py`:
  25 passed (11.715 seconds).
- `python3 -m unittest discover -s scripts/collab/tests -p test_light.py`:
  six passed. Failure/rollback messages are intentional test fixtures.
- `git diff --check`: passed.
- SSH read-only production inspection: old grammar bundle is 4.9 GB.
- Disposable bare Git repositories borrowing live objects read-only recreated
  the exact pasted exports: corpus 6,113 bytes / 0.017 seconds; grammar 6,567
  bytes / 0.016 seconds. No live refs/files were changed or research branches
  pushed during this benchmark.

## What failed
The first benchmark tried the now-updated live branch (already integrated), so
Git correctly refused an empty bundle. A raw historical SHA also does not name
an advertised bundle ref. A disposable repository with an export ref fixed the
measurement without adding temporary refs to production.

## Remaining boundaries
Deployment and a live no-restart capture check follow implementation validation.
Full end-to-end GitHub publication is not rerun just to benchmark private research.
A first partial-cache fill and GitHub fetch/push/PR calls remain network-dependent.
Active repairs must finish before capture. Delta bundles need their recorded
upstream base; keep `backups/publication-cache` while using borrowed checkouts.
Existing post-merge sync/idle-update behavior remains separate.

## Suggested next prompt
If publication is still slow, report the stage printed in the terminal; measure
GitHub/cache/SSH time separately from the contribution capture, which no longer
ships historical scans or restarts Studio.
