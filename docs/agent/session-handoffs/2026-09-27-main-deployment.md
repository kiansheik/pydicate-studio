# Main merge and live deployment repair

## Goal

Complete the user-authorized merge of collaboration PR #2 into main, deploy the
completed source/PDF features, and verify the live application and imported PDFs.

## Files inspected

Required agent docs and earlier source/PDF, progress and VPS repair handoffs;
Makefile, collab ops/host/evidence scripts and tests, Dockerfile/Compose,
Git branch/PR/check state, deployment guide and existing private browser QA.

## Files changed

- `scripts/collab/ops.py`: preflight published release before PDF transfer;
  verify installer/config/importer/CLI capability, pin full SHA, and recheck
  checkout cleanliness and SHA under deployment lock before executing it.
- `scripts/collab/tests/test_release.py`: real disposable Git + shell tests for
  incompatible releases, missing importer CLI, branch movement and changed checkout.
- `test_evidence_sync.py`: assert prepare/preflight/upload/deploy ordering.
- Deployment README and agent current-state/log/handoff.
- Follow-up `PdfEvidence.tsx` ownership guard plus PDF harness/browser regressions.
- Existing completed source/PDF/progress files committed as `74b2bb3`; unrelated
  Neo/VPS handoffs and agent-note changes stay uncommitted.
- Ignored `.local/vps-qa/source-deploy-smoke.cjs` prepares private read-only browser
  verification without creating sources, draft changes or editorial approvals.

## Commands run

- Targeted Git/rg/source inspection; read-only SSH release/container/disk checks.
- `npm run build:app`, `npm run format:check`, `git diff --check`: pass.
- `python3 -B -m unittest discover -s scripts/collab/tests -q`: 39 pass.
- `git commit` and push `74b2bb3` to existing `collab-server-kian` PR branch.
- `gh pr view/edit/checks`, `gh run view`: final description and check monitoring.

## What worked

Current server remains healthy on `871de34`; the failed upload attempt did not
replace the application. PDF upload/checksum had already succeeded in the user's
attempt. Preflight regressions prove incompatible code cannot trigger transfer,
and moving main during transfer cannot change the pinned application revision.

## What failed

The old main lacked the collaboration installer. Initial sandbox networking
could not resolve GitHub/VPS; approved network commands succeeded. No production
secret was printed and no corpus/ground-truth file was approved or published.

## Merge, deployment and verification

- PR #2 merged at `02851f650fe0b34a7d7f4ea102812a33a14786bb` after all four
  push/PR Checks and Collaboration server jobs succeeded on `74b2bb3`.
- Published release preflight ran on VPS before merge without service changes;
  the new image was prebuilt while CI finished, leaving the old app running.
- `make collab-deploy` succeeded from default main: full 84,734,099-byte PDF
  transfer took about 12 seconds, SSH/SHA verified, cached image built, full
  checkpoint taken, dependencies unchanged, migrations and evidence imported,
  containers healthy and publication verification returned merged=0.
- Public `/healthz` returned ok=true with exact merged release `02851f6`.
- Backup `predeploy-20260927T155203-a26223`: both manifest hashes verified.
- Import report: 1 asset, 1 source, 39 passages added, 0 server conflicts,
  63 unmatched entries, 4 unmatched guides, 0 unavailable sources. Bundle/report:
  `data/evidence-imports/3d7bae4836d73db017134b09cb5152f50bfbe3966d2900eda9f9cdb36ba8cd03.tar`.
- Read-only comparison confirms desktop has 105 Araújo passages, hosted has 103.
  Server is clean at corpus `f520ffce`; desktop HEAD is identical but its working
  source is edited. Of 63 unmatched entries, 59 have changed expression fingerprints,
  2 are local-only added passages and 2 are older missing identities. None of the
  61 current unmatched expressions appears elsewhere in the published source.
  Preserve conservative matching; publishing reviewed corpus changes is separate.
- Live browser smoke renders the historical scan and saved regions, switches
  Bettendorff and returns, opens/cancels Nova fonte, and restores selection and
  unchanged drafts. It caught one 422 evidence_bytes response during source switch;
  the stale asset belongs to the previous source. Second live reproduction
  captured ENGINE_ERROR "O PDF selecionado mudou." without changing content.
- Follow-up `cb37135` checks evidence status project/source ownership before
  requesting bytes. Two real-service browser regressions fail before and pass
  after the guard; full PDF suite 11/11, typecheck and formatting passed.
  PR #4 merged as `91707c027dffbcf75a2031e30164f3466209f105`; default Make
  deployment succeeded. Repeat import added 0 passages and left evidence intact.
  Final backup `predeploy-20260927T155759-f791e6` verified both manifest hashes;
  public health reports exactly 91707c0.
- Final private browser report/screenshots:
  `.local/vps-qa/source-deploy-smoke-2026-09-27T16-00-11.578Z.{json,png}`.
  All checks passed: recovery login, 2 real sources, Nova fonte cancellation,
  actual 84,734,099-byte historical PDF rendered on physical page 37 with saved
  region, Bettendorff switch/return, no analysis_status/API/browser errors,
  original selected passage restored and identical shared-draft hashes.
- One duplicate PR #4 hosted CI run passed; another tried drawing before PDF
  render readiness and left Save regions disabled. Product live checks passed;
  the source-workflow test now awaits actual rendering before capturing mouse
  coordinates and asserts the crop exists before saving. This test-only change
  preserves all contributor upload/save/reload/submission assertions.

## Remaining questions

- Unmatched evidence stays in the archive until the author's local corpus edits
  are reviewed and published separately. Do not map changed expressions by ordinal.
- Broad CI reruns for the small follow-ups may still be running; the original PR
  completed all four checks before merge, and the deployed source-switch guard
  has 11 passing PDF browser checks plus the successful live browser smoke.
- Existing unrelated Neo/VPS handoffs and agent-note work remain uncommitted.
  No sibling repository, editorial source, or accepted ground truth was modified.

## Suggested next prompt

After the verified deployment, record the contributor demo using source selection,
Nova fonte, PDF attachment and first-reading review submission.
