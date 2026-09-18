# Scoped authoring service and MCP handoff

## Goal

Implement the attached AI-authoring milestone's shared headless builder, job-scoped authenticated MCP surface, exact dictionary evidence, reconstruction restrictions and an external-client execution helper. Source, lexicon and editorial writes remain absent from model tools.

## Files inspected

Required agent index/current-state/repo-map/open-questions; supplied attachment; `docs/design/ai-authoring-contract.md`; canvas/tree/expression/inline-argument/operation-term domain code; `TreeScopeEditor`, `ExpressionCanvas`, dictionary picker; Python source parser, bounded runtime, service, rendered index, Navarro readers; Electron Python worker and root analysis service. Official MCP 2025-11-25 stdio transport/tools documentation linked in the guide.

## Files changed

- New `electron/authoring/shared-entry.ts`, `shared-authoring.cjs`: imports/bundles the actual UI transformations, no second expression generator.
- New `electron/scratch-service.cjs`: 14 strict tools, actual engine constructors, source-bound revisions, forest edits, dictionary/reuse conversion, complete lexical evidence, partial evaluation, distinct preserved-form comparisons, hypotheses/questions, frozen-feedback branching and lazy candidate details.
- New `electron/studio-mcp-gateway.cjs`, `studio-mcp-stdio.cjs`: private owner socket, scoped token/config/discovery, real MCP initialize/list/call/resources/cancel, duplicate request guards, owner exclusion and scope revocation.
- New `electron/analysis-external.cjs`, `scripts/studio-external-analysis.mjs`: owner-owned external attempt waiting for proposals/questions without inference; CLI contacts the same Electron single-instance owner. Root wires queue/main.
- `electron/python-worker.cjs`: explicit read-only `dictionary_entry_get` allowlist member.
- `python/authoring_service.py`: exact dictionary entry read, read pagination and reconstruction filtering on both reuse search/resolve; conditional on-disk freshness check for scoped parsing.
- `python/navarro_search.py`: website result offset pagination preserving full selected identity.
- New `electron/tests/scratch-service.test.cjs`, `studio-mcp.test.cjs`, `analysis-external.test.cjs`, `python/tests/test_scoped_authoring.py`.
- New `docs/design/mcp-agent-guide.md`: setup/transport/tool workflow, persistence/recovery and UI/headless capability inventory.

Root owns the overall current-state/log update, actual single-writer queue integration, contributor UI and final verification. Do not overwrite their concurrent work.

## Commands run

- `node --test electron/tests/scratch-service.test.cjs electron/tests/analysis-external.test.cjs` — 10 passed.
- `node --test electron/tests/studio-mcp.test.cjs` — 3 passed with a spawned external MCP client and real selected dependencies. Requires a temporary Unix-socket sandbox escalation, approved; no network/provider request.
- `python3 -B -m unittest python/tests/test_scoped_authoring.py -v` — 2 passed.
- Focused `npx prettier --write` on owned JS/TS files — passed.
- `git diff --check` — passed at this boundary.

## What worked

External protocol discovery returns actual tool schemas and guide resources. A real Navarro noun sense (`abá`, website row 2343) retains its full definition/checksum in an isolated candidate; actual selected-engine evaluation yields `abá`; the returned graph is the committed representation. The test edits `.var(1)` with the same transformation as the contributor UI, rejects stale revisions and publication calls, verifies reuse, then excludes the answer-derived construction from resolution. Source/lexicon/reference hashes remain identical.

The real project currently contains 86 passages (the earlier documentation's 82 is historical). The pre-final-parser-change protocol run identified engine fingerprint `sha256:13b7ee8d5dcaeef37e22fdf036b58321b9d99544084a6356ea6aca471ea93405`; fingerprints include Studio adapter implementation, so report the final audit's fingerprint/dependency revisions for the milestone rather than treating this intermediate value as final.

Unit/service tests cover shared detach/connect/holes/orphans, operation/scalar edits, recoverable invalid source, explicit hypotheses, stale project/source/job guards, complete nonverbal evidence, exact frozen-feedback clone, fixed dictionary snapshot, original spelling comparisons, external timeout/questions/cancellation, repeated MCP IDs, token revocation and duplicate owner rejection.

## What failed and was corrected

- The sandbox initially denied temporary Unix-socket binding (`EPERM`); the narrowly scoped test escalation was approved.
- The first real external test exposed the missing explicit `dictionary_entry_get` entry in PythonWorker's allowlist; added it and reran successfully.
- Review caught that cached project comparisons alone do not detect a just-changed on-disk source; revision-bound parsing now calls the real fingerprint check.
- Review caught old feedback candidates could not be copied through the current-job-only lookup; only the exact frozen feedback snapshot is now allowed as a prior branch source, keeping its evidence and leaving the original untouched.
- A duplicate-owner startup must not remove the winning owner's discovery on cleanup; cleanup now removes only the discovery this instance created.

## Remaining questions / limits

No live paid provider experiment was run. Routine tests call no AI provider and perform no historical source/reference mutation. Full main-process CLI startup, queue restart/migration and contributor UI acceptance are integrated/verified by root and UI agents separately. The standalone scope transport tests are not a substitute for those checks.

External mode completes at the first successfully committed proposal/question; a client should assemble desired candidate alternatives before its completion action. Its token cannot submit jobs or extend its own scope. The CLI starts an external attempt from an already saved Studio passage; it does not itself edit source preparation fields.

Reconstruction filtering is conservative: merged reusable entries are withheld if any occurrence came from an excluded answer, and unrestricted helper inspection is disabled. Manifest authors should explicitly include answer-bearing lexical names when necessary. Dictionary evidence remains permitted; matching a string does not confer structural support or approval.

## Suggested next prompt

Run the independent linguistic critic against the tool inventory, actual Araújo audit and scoped external-client evidence; then review contributor acceptance, stale owner/restart/cancellation, managed image responses and publication isolation against the integrated queue/UI.
