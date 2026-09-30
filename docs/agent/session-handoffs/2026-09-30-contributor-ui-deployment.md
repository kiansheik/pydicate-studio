# Contributor UI production deployment

## Goal

Deploy the latest Studio UI and server changes while preserving the production-only
nasal causative repair, live corpus, contributor drafts and PDF evidence.

## Files inspected

Required agent wiki; Makefile/package scripts, release workflows, collab ops/host
scripts and Dockerfile; Claude auth/status and its tests; source workflow fixture;
private existing read-only production smoke procedure; production release/health.

## Files changed

Prior contributor/source consolidation changes committed in `113c9aa`, with a
one-line optional Claude status correction and regression tests. An unconfigured
optional provider now reports unavailable instead of returning HTTP 503 during
ordinary editor loading; explicitly starting unconfigured login still fails.
`485d359` updates the source-append browser expectation to blank transcription,
while verifying the first passage keeps its saved transcription after switching.
Deployment documentation and this handoff record the final outcome below.

## Commands run and validation

- Local typecheck, formatting, Vite production build and diff checks passed.
- Next-passage domain tests: 8 passed; usage tests: 2 passed; Claude auth tests:
  3 passed; corrected source browser spec: 3 passed.
- Initial full CI: 220 browser cases passed, 103 existing environment-dependent
  cases skipped, one stale source-append assertion failed. Both duplicate runs
  agreed. The single assertion was corrected to the new requested behavior.
- Hosted CI passed on rerun. Its first attempt failed during one Python worker
  startup with an invalid protocol response; no deterministic cause established.
  The previous main's unrelated optional-Claude 503 failures are fixed.
- PR #15 publishes the release. A production image was built while the old app
  remained live. Final head checks and rollout results are recorded below.
- Server-only content hashes cover 153 grammar/corpus/evidence files and 254
  draft rows. No private record contents were exported.
- Removed only the disposable engine staging directory from the completed mo
  correction, because its symlinks would block routine backup. Recovery files,
  live grammar and immutable draft history remain in place.

## What worked

The release procedure checkpoints state, preserves dirty grammar/corpus working
copies, and starts the new app only after the image builds. Application deployment
uses the pinned published revision without importing unrelated desktop state.

## What failed

The initial local browser attempt was sandbox-blocked from binding its dev-server
port; the permitted run passed. CI failures and their disposition are above.

## Remaining questions

The mo correction's full sentence argument configuration remains an editorial
question, outside this app rollout. Production grammar changes remain uncommitted
in their own server workspace; the app deployment did not publish them upstream.

## Suggested next prompt

Collect contributor feedback on compact-screen navigation and consolidated passage
entry; retain explicit AI submission and the production grammar correction.

## Final rollout

- PR #15 merged as `21d60355767a1a4a105fdcc440d4f5d2e59bcb2e`.
- Final head Checks runs `36664392124` and `36664395904` passed; hosted run
  `36664395895` passed on its first attempt. Initial transient hosted failure
  was on the preceding commit, not this final run.
- `Remote.prepare_release(full_sha)` and `deploy_release(sha)` completed. A
  preliminary short-SHA fetch failed safely; full immutable SHA succeeded.
  No desktop research import or credential replacement was requested/run.
- Backup: `predeploy-20260930T033256-c7a3cd`. Both dirty dependency repositories
  were preserved, migrations succeeded, app/DB are healthy, publication receipt
  verification returned merged=0, and public health reports the exact release.
- Read-only authenticated production smoke passed at 1024×768 and 800×600:
  pane navigation, scrolling to the final passage, diplomatic field, absent
  Save/analyze and basic-mode close buttons; no browser errors or attempted
  content/publication/AI writes. Private screenshot:
  `.local/vps-qa/consolidation-live.png`.
- Production corpus verification: 150 rows unchanged, 149 matching references,
  zero failures; 30 focused grammar tests pass. The additional test and a second
  grammar file changed while CI ran, along with one draft. The earlier hash
  baseline detected these. Comparison against the actual pre-deploy checkpoint
  confirmed all 153 file hashes and all 254 draft hashes/versions match exactly.
  Both backup manifest checksums were independently verified. These concurrent
  changes preceded deployment and were preserved, not introduced by the release.
