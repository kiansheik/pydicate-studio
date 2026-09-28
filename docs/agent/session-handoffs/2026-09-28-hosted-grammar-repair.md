# Hosted grammar repair

## Goal

Make the user's saved hosted correction edit the selected grammar, verify the
result and automatically refresh the UI as desktop does. Preserve saved input,
research, PDF evidence and human review state.

## Inspected

Provider/analysis service and MCP gateway; grammar-repair tools; hosted runtime,
AI authorization and browser bridge; deployment sparse checkout; analysis UI.
Narrow production job/thread diagnostics and the prior investigation handoff.

## Changed

- `electron/provider-codex.cjs`, provider tests and `scripts/check-codex-tools.mjs`:
  exact Studio guide resource compatibility, bounded rejection identity, errors.
- `electron/grammar-repair.cjs` and tests: truthful contained file discovery.
- `scripts/collab/host.py` and deployment tests: additive sparse support after backup.
- `src/domain/analysis.ts` and tests: completed/failed activity labels.
- `server/tests/grammar-reload.test.cjs`, hosted CI: actual browser repair flow,
  real Python edit/reload, automatic rendered output update, unchanged research.
- Agent current state/log and this handoff.

## Commands and results

- `npm run build`: passed.
- `npm test`: 251 passed.
- `python3 -B -m unittest discover -s scripts/collab/tests -p test_operations.py`:
  15 passed, including dirty sparse checkout preservation.
- Focused provider/MCP tests: 69 passed; grammar-repair tests: 8 passed.
- `npm run test:codex-tools`: installed Codex with isolated fake API passed
  guide access, all six grammar tools and tool-error recovery. No paid inference.
- Real PostgreSQL/Python compiled editor test: passed in 18 seconds with installed
  Chrome, changing disposable abá to kunhã via actual correction dialog and SSE.
- Hosted service suite on disposable PostgreSQL: 65 passed, 7 optional skips.
- `npm run test:desktop`: 284 passed. `npm run format:check`: passed.
- Build regenerated local learning data from neighboring docs; restored that
  generated file to HEAD, keeping this change scoped.

## What failed and remaining questions

The first broad CI browser run passed 209 tests and failed one outdated
activity fixture that marked a completed job with only tool-start events. Updated
it to include completed dictionary results and a failed grammar read, retaining
dedup/history assertions and adding truthful failure-label assertions. All 19
analysis-workspace browser tests pass after the fixture correction. Hosted CI,
including the full compiled repair flow, passed.

Original missing guide alone did not reproduce the fatal error; the rejected
historical tool identity remains unknown. Standard resource-helper access does
reproduce the same failure class. Foreign servers/resources remain forbidden.
The initial browser fixture required installed Chrome because bundled Playwright
Chromium was absent. Production results are recorded below.

## Suggested next prompt

Review the live correction before publishing the server grammar contribution.
Preserve its original failed attempt and correction receipts; do not re-run a paid
repair merely to inspect this result.


## Production release and exact saved correction

- PR: https://github.com/kiansheik/pydicate-studio/pull/13
- Runtime: `4384e8b735c1bd11eb27e853daecfb5fb9ffcb3b`.
- Final PR head: `74f23b9dc5acfd5fc42ad7ed801ce257f3ffd656`; both Checks
  runs and hosted CI passed. Deployed merge Checks/hosted CI passed too.
- Code-only deployment via `Remote.prepare_release('main')` / `deploy_release`,
  without importing desktop data. Existing dirty corpus work remained intact.
- Backup: `/srv/pydicate-studio/backups/predeploy-20260928T180046-438bf1`;
  independently verified database.dump and workspace-state.tar.gz checksums.
- Original job: `job:3c0fe705-26fb-4155-afee-9997167ee12f`.
- Original failed attempt retained: `attempt:0d981777-8383-4bcb-bead-afbc69bf7f7a`.
- UI resumed attempt: `attempt:9443b289-a781-478e-ae4a-d0bd2f3f7816`,
  18:01:53–18:06:20 UTC, completed `ready-for-review`. Existing saved limits
  were used; no unrelated linguistic experiment/provider request was submitted.
- Exact verified form: `sete abá reté reséndûara nã e'i`.
- Grammar already treated -ndûara as nominal. The fix lets a Number with its
  nominal complement attach as a whole verbal argument rather than trying to
  attach the verb as another number complement. The subject is third person.
- Three hash-checked receipts: `pydicate/pydicate/lang/tupilang/pos/number.py`,
  `pydicate/tests/test_nominal_annotation_preservation.py`, `AGENT_NOTES.md`.
  These remain uncommitted changes on the server, not published upstream.
- Verification: 146 corpus passages; zero changed surfaces/source changes,
  zero baseline/new reference issues. Original expression and lexicon preserved.
- Ran production `python3 -B /workspace/nhe-enga/pydicate/tests/test_nominal_annotation_preservation.py`
  as uid/gid 1000: all 17 tests passed, including exact form, third-person
  subject, annotated output, noun/object contrasts and operand preservation.
- Compared private predeploy/post-repair snapshots: all 178 drafts/versions,
  both PDF evidence documents, recovery and import receipt unchanged.
- First live browser harness denied its own `/api/refresh` request and triggered
  retries/ENGINE_BUSY responses. This is a QA harness failure, not evidence of
  a product refresh failure. Corrected fresh authenticated browser verification
  permits that read endpoint, starts no inference, and confirms the exact rendered
  form, review card, unchanged drafts and zero browser/API errors/blocked writes.
  Automatic SSE refresh is verified by the separate compiled hosted regression.
- The final model response repeated the historical missing-guide diagnosis.
  Direct postdeploy inspection confirms the guide exists, is regular, has one
  link, and is 11,437 bytes. Do not treat model prose as current filesystem evidence.
- Private artifacts: `.local/grammar-repair-fix/` (logs, exact job snapshot,
  research parity hashes, backup verification and final screenshot). Never commit.

## Review boundaries

One actual correction passed; this does not establish general historical or
linguistic correctness. Independent diff review found one additional edge case:
Number dispatch currently sets `pro_drop=False`, so an explicitly dropped
quantified phrase (`+phrase`) is not preserved by that new path. It does not affect
the submitted undropped phrase; broader grammar review should cover it before
publishing. No neighboring local repository, historical source, ground truth or
editorial approval was modified by this Studio change.
