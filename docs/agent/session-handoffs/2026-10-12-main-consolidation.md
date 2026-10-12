# Publish the pending Studio work on main — 2026-10-12

## Goal
Commit all pending Studio changes and publish them to main at the user's explicit request, retaining private release ancestry.

## Files inspected
Agent index/current-state/repo-map/open-questions; current staged/unstaged/untracked inventory; .gitignore; Git branch/remote/history; CI workflows; clean deployed release checkout 312eba3; current deployment/coreference handoffs. A read-only reviewer compared every product file and scanned pending paths for accidental credentials/account metadata.

## Files changed
All authorized pending files in this checkout: runtime memory/performance/diagnostics and MCP-owner recovery, publication-volume/sparse-Git fixes, referential pronouns and phrase-card routing, associated tests/fixture, ignore rules and handoffs. Main publication adds only this handoff and current-state/log entries to the already tested snapshot. No engine/corpus repository edits or generated/private artifacts are included.

## Commands and validation
- git fetch origin main: origin/main and local main both 921b502 before consolidation.
- Product code/tests/configs match deployed 312eba3 byte-for-byte; only .gitignore and docs differ. Current-only docs are the October 8 engine-spacing record and October 12 deployment handoff. All untracked paths are expected source/tests/fixture/design/handoffs.
- npm run format:check and git diff --check: pass.
- Prior matching release validation: npm run build, 307 unit tests and five focused browser tests pass; runtime 305 pass/three optional skips. Full Python/browser known baseline failures are recorded in the feature handoff and are not claimed fixed.
- Private history fetch, current snapshot commit, ancestry merge and main push: pending.

## Results / failures
Pending publication. Ignored node_modules, local backups, credentials, generated runtime/build assets, screenshots and packaging binaries stay outside Git. The runtime is already deployed and accepted by the user; this operation publishes source history without another rollout.

## Remaining questions
CI results after push remain to be observed separately from prior local/deployed validation. No new linguistic/editorial approval is implied.

## Suggested next prompt
Review the new main CI results and address any failure separately from the preserved known baseline failures.
