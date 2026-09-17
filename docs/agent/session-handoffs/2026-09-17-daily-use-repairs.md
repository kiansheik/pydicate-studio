# Daily-use repairs — 2026-09-17

## Goal

Repair the user's actual saved-session generation failures, stalled Codex translation feedback, duplicated tree/construction projections, inaccessible completion workflow, and missing durable usage history. Keep routine tests free of provider generation calls. Preserve all existing work and historical repositories.

## Diagnosis and inspected files

Read the agent guide/state/map/questions, original request attachment, README, current working tree, draft types/validators/store/hook/App, adapter/source fingerprints/runtime, Python worker, main/preload/next-service, provider service/transports and saved request metadata. Read the user's actual application-data drafts/identity registry without modifying them; run regressions only against copies.

- Actual profile had 134 drafts for the current 82-passage project, including 52 retained earlier identities. Sixty-nine current drafts still used expression-only fingerprints. Most first-version drafts had no `raw` field. Evaluation could succeed but `isCurrentRender` compared it with an empty expression, and the conflict gate suppressed results.
- The failed first-line Codex request acquired source/MCP context, produced no response text, and reached its 180-second timeout. The context label was stale. Studio inherited global `ultra` effort. This may explain latency, but the old history cannot establish the exact model-side cause.
- Status in the main heading was hard-coded; the tree tab rendered the same AuthoringEditor as construction.

## Files changed

- `src/domain/{types,model,usage}.ts`, model tests; `src/useStudio.ts`, `src/App.tsx`, `src/main.tsx`, `src/authoring.css`; `electron/{main,preload,validation,python-worker}.cjs`; `python/adapter.py`.
- New `RuntimeTree.tsx`, runtime-tree domain/layout/CSS and Python/TS/browser tests; actual graph extraction in `python/authoring_runtime.py`.
- Provider service/adapters/context/RPC, assistant UI/domain and provider tests; see [provider handoff](2026-09-17-provider-progress.md).
- New local usage service/tests, `UsagePanel.tsx`, `scripts/usage-report.cjs`, `scripts/smoke-session.mjs`; package scripts; README/design/agent documentation.

## Result

Legacy migration requires proved source identity, restores raw from the saved imperative edit or unchanged source, preserves human fields/revisions, and retains conflicts when human fields differ. All orphan drafts remain available. Conflicted current drafts may be evaluated without authorizing source writes. Failed retries clear previous results. Refresh validates a replacement Python worker before adopting it and recovers from a dead worker. Runtime fingerprints exclude audit-only scripts.

Local workflow controls expose Em análise / Precisa de revisão / Concluída with one-click completion and completed/open filters. They persist independently of formal reference approval, do not trigger evaluation, and survive content undo/redo.

Árvore now displays a deduplicated graph of evaluated Pydicate objects, actual argument/adjunct/reference links and engine-derived roles. It supports keyboard selection, collapse, hidden-node search, pan/zoom/fit, fullscreen, an inspector, and standalone SVG export. Initial overview uses the measured pane size and targets at least 65% zoom; explicit expansion survives resizing. Graphs above 1,200 objects carry an explicit truncation diagnostic. Only the evaluated root has a proved source-node mapping; arbitrary morpheme-to-node alignment is not invented.

Provider progress/timing persists through source context, MCP, connection, thread, request, reasoning and output. Cancellation/deadlines terminate waits even on unresponsive phases; late output cannot revive a cancelled request. Effort defaults explicitly to medium, with supported model choices. There is no automatic request retry.

Atividade records bounded local JSONL history across sessions/builds: navigation, grouped edits, workflow decisions, save/parse/evaluation/provider failures and durations. No prompts, generated responses, scholarly text or credentials enter these logs. Export and the read-only `npm run usage -- --days 7 --json` command support later analysis. Recording starts with this version; old activity cannot be reconstructed. Counts describe observed events, not intent or wasted effort.

## Commands and verification

- Passed 24 domain tests, 81 desktop assertions, 48 existing Python tests plus 3 graph tests, and 29 browser scenarios.
- `npm run build`, `npm test`, `npm run test:desktop`, `npm run test:python`, `npx playwright test`, formatter and `git diff --check`.
- `node scripts/smoke-session.mjs <existing-profile>` copies drafts/identities to temporary application data and exercises every current passage. All 82 rendered; completion survived restart; every original human field/revision and retained draft survived; source hash unchanged. Two local usage sessions were recorded. A final five-passage native check also injected incomplete code, verified PARSE_INVALID in durable logs, and restored a valid render. [Machine-readable evidence](../../coverage/session-repair-regression.json). No provider generation requests.
- Focused runtime tests compare actual engine relationships, cycles, hidden-node searching and SVG interactions. Actual first-line and expressions 16/56/67/78/82 graphs were inspected.
- Read-only actual first-line MCP context completed in 388 ms; local Codex authentication/model discovery in 735 ms. These are connection/context checks, not a generated translation.

## What failed and was corrected

First inspection reproduced missing-raw/fingerprint failures. Independent review reproduced completion lost on content undo and an old successful result retained after failed retry; both fixed with regressions. Refresh identity validation was moved before worker adoption. Logs now classify invalid parse/failed restore payloads as errors and preserve worker codes/request IDs. Initial duplicate telemetry effects, edit-batch order/revision, stale usage-report responses and invisible offscreen tree were corrected. Intermediate typecheck ran before the parallel tree file existed; final integration builds pass. Formatter caught late main edits; formatted before final check.

## Remaining questions

No new live translation was requested, honoring the user's quota constraint. The provider's model-side response remains unverified after these repairs; detailed phases will identify a recurrence. Python work already dispatched before navigation continues until its bounded completion/timeout. Logging is local to each installation; combining other contributors' histories requires their exports. Earlier full linguistic-fidelity coverage remains historical evidence for that build; this repair's native check specifically verifies persisted-session rendering and recovery.

## Suggested next prompt

Use `npm run usage -- --days 7 --json` and selected exported request progress to analyze the next real authoring session. Identify frequent errors or repeated navigation without assuming intent. Reproduce fixes with saved-profile copies and simulated providers; do not run live generation probes unless explicitly requested.
