# Unlocked editing and lightweight deployment

## Goal

Disable disruptive passage reservations now, retain optimistic save/version and
history protections, and provide a routine app-only rollout without waiting for
full CI or repeatedly compressing the research workspace.

## Files inspected and changed

Store claim checks, panel controls, HTTP/presence and browser save transport;
collab host/ops/Makefile and deployment definitions; core/AI/submission fixtures.
Changed Store to default claims off (explicit `COLLAB_PASSAGE_CLAIMS=1` opt-in
remains), hide old reservations and remove reserve/release UI. Authentication,
roles, stale-save detection, atomic writes and history remain active. Existing
claim rows are ignored and expire normally; no contributor data is cleared.

New `scripts/collab/light.py` and tests plus host/ops/Make integration. It checks
installation files and migration trees against the current release, builds while
serving, saves a database dump under `light-backups/`, switches only Studio with
`--no-deps`, checks health/exact release, and returns to the previous image if
startup fails. It never syncs dependencies or imports desktop data. Light dumps
are separate from full-backup retention, so routine light deploys cannot displace
full recovery checkpoints. This is not a full disaster-recovery archive.

## Commands and results

- Node syntax checks for edited server files; git diff checks.
- Fresh throwaway local PostgreSQL on port 55439, stopped after tests.
- Core/AI/submission tests: 23 pass, including two users editing the same passage
  with old claims present, rejection of stale saves, immutable history and
  disabled-account rejection. Legacy claim tests explicitly enable the feature.
- Focused rollout tests: compatibility guard, app-only success, failed-image
  rollback. Initial macOS /var versus /private/var assertion fixed with resolve.
- `make collab-deploy-light` is the normal command for compatible app-only work.
  Use `make collab-deploy` for dependency/container/schema changes. Full CI can
  continue independently; choose focused behavior tests appropriate to each edit.

## What worked / what failed

Focused collaboration checks complete in about 2.5 seconds. A one-minute cached
rollout is an objective, not a guarantee: image build/network/health readiness
still vary. First implementation and testing are separate from deployment time.

## Remaining questions

Record live release, actual rollout timing and read-only claim/UI verification
below. Actual concurrent draft conflicts remain intentional and protect edits.

## Suggested next prompt

Use the light deployment path for routine app changes, keeping focused tests and
checking live health. Revisit collaborative editing only after contributor feedback.
