# Referential pronoun deployment — 2026-10-12

## Goal
Deploy the tested referential pronoun changes to the collaborative server while preserving the existing private fixes and saved research.

## Files inspected
Agent index/current state/repo map/open questions; local-setup and deployment README; October 8 publication and October 12 pronoun handoffs; Makefile, package.json, Dockerfile, playwright.config.ts; scripts/collab/{ops,host,light,progress}.py; prior private deployment guard and release preparers; coreference tests and working diff.

## Files changed
Private candidate `/private/tmp/pydicate-studio-coreference-release`, based on live `7bd59ae`, copies only the 23 pronoun feature files plus candidate current-state/log entries. Private commit `400f0b253db882146906b02e3ee883f1ba9f13d3`. Root changes for this deployment are current-state.md, log.md and this handoff; existing staged and unstaged work retained. Private preparation/validation files are in `.local/coreference-deploy-20261012/`.

## Commands and results
- SSH read-only release/status/idle inspection: live `7bd59ae`, clean release, idle.
- `npm run build`: passes in isolated release.
- `npm test`: 36 files / 300 pass.
- `PYDICATE_PROJECT_PARENT=/Users/kian/code python3 -B -m unittest python/tests/test_coreference.py`: 7 pass with real engine.
- `npm run test:runtime` with local IPC permitted: 305 pass, 3 optional skips, zero failures; sandbox run hit IPC-dependent failures.
- Playwright isolated strict port 5198, selected real corpus, two pronoun tests: 2 pass. Initial sandbox port binding failed; initial no-corpus invocation skipped both, corrected before release.
- Private Git commit and checksum-verified incremental bundle. Full-history upload stopped because transfer was slow; no live restart occurred during that attempt.
- Guarded app-only rollout: healthy `400f0b253db882146906b02e3ee883f1ba9f13d3`; 91.2 seconds for image build/checkpoint/switch/parity.
- Complete 454-file analysis archive verified in `light-backups/coreference-20261012T195131-383d0a`; database checkpoint `light-backups/20261012T195248-a68be2` checksum and `pg_restore -l` readability pass.
- Before/after parity: zero changes across nine tables (280 drafts / 3368 revisions) and all fingerprinted files: authoring9, historic10, ground_truth6, pydicate49, tupi74, evidence7, desktop-imports611, evidence-imports3, analysis454.
- Both workspace Git indexes retain 1000:1000 ownership and 0600 mode. No credentials replaced, pruning, upstream merge or corpus/engine mutation.
- Six read-only syntax/real-engine tests pass inside the deployed container.
- Public health confirms exact release `400f0b2`. Anonymous root/assets correctly redirect to `/login`; no authenticated user browser check performed. Container artifact check verifies installed pronoun controls. Local Python urllib lacks its CA issuer; curl uses working certificate trust, with no verification bypass. The first raw SSH artifact probe lost Python argument quoting; corrected using Remote.ssh structured arguments.

## Remaining questions
Authenticated user acceptance on the intended sentence remains untested in this turn. Public health/artifact delivery and deployed-engine checks are recorded separately from manual acceptance. Existing broader Python/canvas failures are documented in the feature handoff and not claimed fixed. Manual user sentence/browser acceptance remains separate.

## Suggested next prompt
Test the referential pronoun on the intended passage in the deployed browser editor.
