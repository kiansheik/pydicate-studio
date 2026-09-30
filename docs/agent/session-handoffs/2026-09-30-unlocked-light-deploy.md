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

Actual concurrent draft conflicts remain intentional and protect edits. PR #16
is open; do not deploy old main and accidentally restore reservations. Until it
merges, pin `STUDIO_REF=unlocked-light-deploy make collab-deploy-light`.

## Suggested next prompt

Use the light deployment path for routine app changes, keeping focused tests and
checking live health. Revisit collaborative editing only after contributor feedback.

## Live result

- Release `290da542827bf9909e238c97b17c0b9f3deb556d`, PR #16. The automatic
  reviewer rejected direct-main publication without full CI; the separate
  reviewable branch and explicitly requested light deployment were approved.
  No full-CI gate was added; main remains unchanged pending ordinary review.
- Exact Make command wall time: **18.1 seconds**, including preflight and focused
  rollout tests. Server rollout: **13.4 seconds**. PostgreSQL stayed running.
- Light DB checkpoint: `light-backups/20260930T034213-340ee6` with manifest hash.
  Live grammar, PDFs, research and existing full checkpoints were not changed.
- Existing Kian/Emerson identities both passed `assertClaim` on the exact pending
  passage; reservationsEnabled=false and claimList=[]; no draft saves or claims
  were created by this verification. Public app health reports the exact SHA.
- Server-only optimization copies server/docs/deploy tooling onto the previous
  image only when the changed paths allow it; any frontend/runtime change takes
  the normal image build, and install/schema changes refuse the light path.
- The old claim rows may remain until ordinary expiry cleanup; they are ignored.
  An already open browser can retry its save without reservation enforcement.
  A refresh updates the old panel; unsaved local work should be retained/exported
  before reloading when the existing recovery prompt advises it.
