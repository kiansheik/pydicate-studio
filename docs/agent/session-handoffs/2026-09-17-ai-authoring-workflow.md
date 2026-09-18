# Persistent AI authoring workflow

## Goal

Implement the supplied `f8b3609c-2cda-428c-ac79-ba089d2b898a/pasted-text.txt` milestone in the existing Studio: persistent Fonte/IA support, saved and revision-bound inputs, shared headless builder/MCP, iterative providers, durable jobs and alternatives, actual PDF crops, explicit human draft acceptance, recovery, independent reviews and real-data evaluation templates. Preserve the earlier uncommitted ground-truth shortcut and inline call-argument edits.

## Files inspected

Required `docs/agent/{index,current-state,repo-map,open-questions}.md`; supplied implementation prompt; source/evidence/canvas/publication/provider contracts; Electron main, worker, draft/evidence/provider/next services; Python authoring, source annotations, dictionary and reuse index; renderer model, draft hook, source/PDF/workspace/assistant components; current actual Araújo source, shared lexicon and saved references; installed Codex 0.153.4 schemas and official provider documentation. Exact provider references are linked in [provider contract](../../design/ai-agent-providers.md).

## Files changed

- Main-process authority: new `electron/analysis-{store,service,input,external}.cjs`, scoped immutable capture, queue/attempt/checkpoint/candidate/conversation records, input digests, bounded data, interrupted-run recovery and explicit retry. `draft-store.cjs`, validation/main/next services and `src/useStudio.ts` now preserve acknowledged storage revisions and authoritative acceptance receipts. Identical filesystem refreshes retain a working worker/job.
- Shared authoring: `electron/{shared-authoring,scratch-service,studio-mcp-gateway,studio-mcp-stdio}.cjs`, `electron/authoring/shared-entry.ts`, `scripts/studio-external-analysis.mjs`; actual contributor transforms, authenticated external owner access, scoped research and candidate tools, exact revision/idempotency guards. No source publisher, approval or arbitrary interpreter tool is exposed.
- Providers/images: `electron/agent-runner.cjs`, Codex/Claude/RPC adapters, new `evidence-images.cjs`; iterative tool protocol, finite budgets, no silent inference replay, actual saved-region image blocks. Direct pinned `@napi-rs/canvas` dependency and minimal lock update.
- Renderer: `AnalysisSupport.tsx`, analysis domain/style modules, App/source/PDF/dictionary/workspace/assistant components and draft hook. Separate tentative input; support-pane conversation/batch queue; exact question/alternative binding; readonly candidate preview and explicit acceptance/undo; durable composer, layout, evidence and lazy historical detail.
- Python: readonly exact dictionary entry and pagination; scoped real reuse/resolve with allowed-origin contexts, stricter answer exclusions, current parse fingerprints. `rendered_structures` cache version 2 preserves per-origin resolution context. Existing test assumptions now discover the current86-row corpus instead of hardcoding82.
- Tests/scripts: deterministic domain, desktop/MCP/provider/image/service and browser suites; production `scripts/smoke-analysis.mjs`; real-data `scripts/build-authoring-eval.py` and checked-in separate reconstruction/assisted artifacts.
- Documentation: contributor, MCP and provider guides; shared contract; coverage artifacts; three critic reports; native evidence; current state/repo map/open questions/log; this handoff and focused [UI](2026-09-17-ai-support-workspace.md), [MCP](2026-09-17-scoped-authoring-mcp.md), [provider](2026-09-17-iterative-provider-adapters.md) and [evaluation](2026-09-17-authoring-evaluation-set.md) handoffs.

## Commands run and outcomes

| Command | Outcome |
|---|---|
| `npm run build` / `npm run typecheck` | Pass. Existing Vite chunk-size advisory remains. |
| `npm test` |129/129 pass in18 files. |
| `npm run test:desktop` |167/167 pass in the final run, including actual process-kill recovery, temporary Unix sockets, external stdio MCP and real local dictionary/engine. |
| `npm run test:python` |152/152 pass in199.022s against the current selected dependencies. |
| `node --test electron/tests/analysis-service.test.cjs electron/tests/draft-store.test.cjs` |18/18 pass after the final receipt replay/directory-fsync change. Includes publication identity and replay after later human edits. |
| `npx playwright test tests/analysis-workspace.spec.ts --reporter=line` |10/10 pass in critic's isolated output run. |
| `npx playwright test tests/pdf-evidence.spec.ts` |5/5 pass. |
| `npx playwright test tests/workspace.spec.ts` |2/2 pass. |
| `node scripts/smoke-analysis.mjs` |Pass with real Electron/worker/PDF/dictionary/MCP, deterministic provider boundary, actual disposable publication and retained history. [Recorded evidence](../../reviews/ai-native-evidence.json). |
| `npm run audit:araujo` |86/86 source/import/tree/span/no-op/reimport/evaluation/surface/annotation/structure checks. Current fingerprint-matched per-expression native certificates remain0/86; targeted native integration is a separate claim. |
| `npm run eval:authoring:build` |6 reconstruction +6 assisted templates,1122 scoped indexed structures, source/dictionary/reference hashes unchanged,0 requests. Repeated generation deterministic. |
| `python3 -B -m unittest discover -s python/tests -p test_authoring_eval_set.py -v` |4/4 pass after correcting generated index-version provenance to the actual module version. |
| `npm run format:check` / `git diff --check` |Pass. |
| `npm run doctor` |Exit1: correctly reports drift from the older captured dependency baseline, detailed below. It changes nothing. |

Provider availability checks, without inference: `codex --version`, feature inventory and normal/experimental `codex app-server generate-json-schema`; actual initialize and `thread/start` against the scoped MCP succeed, with no `turn/start`. Claude's authenticated model-discovery check returns11 models and0 generation requests. Neither proves available billing for a model turn.

Local artifact logs: `/tmp/pydicate-ai-final-domain.log`, `/tmp/pydicate-ai-final-desktop.log`, `/tmp/pydicate-ai-python-tests.log`, `/tmp/pydicate-ai-final-eval.log`, `/tmp/pydicate-ai-final-format.log`, `/tmp/pydicate-ai-doctor.log`. Final native artifact directory: `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-analysis-native-5zCInu`.

## Actual dependencies

Both selected sibling checkouts were already dirty and were read-only throughout this milestone. HEAD alone does not describe the tested contents.

| Dependency | Revision | Content fingerprint |
|---|---|---|
| oldtupicorpus |`292a28722a1790abf3f3b93083c29fbd47b4ffd0` |`sha256:df973319740073f4b81ef934d2e0716e2d0461d46379ae12103e4c49666a5a60` |
| nhe-enga |`348686045bf0791c847be3cba1b15eaae7312a11` |`sha256:45b24493e532feb45b64af9db3118016e1b6220d0a19046ff7dca346a144f639` |

Python3.14.4; installed Codex0.153.4; PDF.js5.4.624; direct canvas0.1.100. Final selected engine/Studio execution fingerprint: `sha256:e2949abcea23c1bc523dcaede7ad2b0849882a3e7fe4c58ca13da0ce30b29afd`. Full source, lexicon, reference and dictionary hashes appear in [evaluation provenance](../../evaluation/araujo-authoring-v1/provenance.json).

Doctor drift: source, shared lexicon and saved references changed after the old corpus snapshot; five existing engine files differ, with suffix implementation and three regression files added. The captured dependency patches differ accordingly. Existing patches/baseline were preserved, not silently rebased; current real-engine audit and Python tests pass. No new sibling dependency patch was required for this milestone.

## What worked

Native typed input → exact saved own region → immutable text-only job → real dictionary/shared builder/evaluator → independent proposed candidate → feedback with actual saved PDF pixels → explicit acceptance/receipt → ordinary named source/lexicon preview → undo → restart/navigation all pass. Production external CLI starts the same owner without a renderer, discovers real MCP capabilities, reads Navarro, builds/edits/evaluates/proposes, and the UI sees the same committed candidate. Final human publication in a private corpus succeeds and retains pending passage conversations under the published identity. Original source/lexicon/reference hashes are unchanged; zero provider generation, page errors or remote HTTP requests.

Atomic input capture rejects changed draft/evidence versions without creating a job. Renderer CAS cannot erase newer work; retained acceptance provenance survives undo and pending-to-published migration. Replaying an accepted command after later publication/edits acknowledges the original receipt without reapplying its candidate. New stale acceptance still fails. Jobs retain immutable original IDs/input/digests while UI identity follows actual publication.

Three separate critic rounds covered integrity, contributor workflow and failure behavior, with fixes between rounds. [Round1](../../reviews/ai-round-1-integrity.md), [round2](../../reviews/ai-round-2-workflow.md), [round3](../../reviews/ai-round-3-persistence.md) retain findings and post-fix evidence.

The independent `analysis-crash.test.cjs` kills only its actual fixture child after scratch/checkpoint persistence. Recovery preserves those records and original input, blocks the ambiguous running attempt, starts only never-dispatched queued work, and rejects stale ownership. Explicit retry adds an attempt. A legacy draft envelope remains byte-identical until its first guarded save. This verifies process interruption, not hardware power-loss durability or exactly-once provider billing.

## What failed and was corrected

- Shared-reuse filtering dropped permitted lexicon/Araújo origins; nested reconstruction/provider packets leaked withheld answers; legacy saved surfaces overstated review of current expressions; replaced words retained misleading active dictionary evidence. Scope resolution, shared redaction and evidence bindings were fixed and independently checked.
- UI questions replied to the wrong alternative, batch preparation ignored tentative/PDF-only inputs and image consent, summary refresh erased visible transcript turns, and older lazy results falsely claimed absent pixels. All four were corrected and reprobed.
- Publication changed passage identity and hid saved AI history. Canonical display/thread association now follows publication without modifying immutable job inputs.
- Independent MCP clients collided on ordinary JSON-RPC IDs; replayed cancellation could stop a later attempt; external retry could immediately finish from retained old results. Connection namespaces plus explicit durable command IDs, attempt-bound cancellation receipts, and a pre-scope external baseline fix these cases.
- Acceptance acknowledgement could fail freshness after the already-accepted draft was published. Exact receipt replay now precedes new-operation freshness checks, returns the current draft unchanged and repairs an interrupted decision mirror.
- A byte-identical macOS watcher refresh closed an active worker; retain the existing worker for unchanged snapshots. Installed Codex redacted `config/read` data was not valid thread configuration; override only server enablement and supply the scoped transport.
- Initial full Python checks had8 stale test assumptions after the real source grew to86; fixtures now discover counts, create intentional gaps and restrict allowed adjacent note replacement. All152 then passed.
- Default sandbox cannot create local listeners (`EPERM`); narrowly escalated fixture executions succeeded. No automatic approval rejection occurred. Overlapping browser runs once collided in trace cleanup; independent isolated-output rerun passed.

## Remaining questions and limits

Live linguistic usefulness, tool-selection quality and current paid-generation billing are **not tested**. The earlier Claude insufficient-credit result remains unresolved by successful model discovery. All12 evaluation cases remain `not-run`; a separately initiated explicit budget is required for live experiments. Reconstruction templates withhold answer/derived reuse, and evaluator-only answers must never enter model tools or context.

Codex has no supported hard per-turn output-token cap in the installed schema; observed usage/text ceilings and cancellation are bounded stop controls, not exact billing guarantees. Jobs continue with the window closed only while the app owner runs. Quitting/interruption preserves work and requires explicit retry rather than silently replaying a possibly billed call. The existing64MiB project analysis bound reports capacity explicitly. Unusual historical PDF codecs/fonts and arbitrary new linguistic edits are not certified by the86 existing examples.

No commit, push, original corpus edit or ground-truth approval was performed. Source publication in native tests affected only disposable copies. Earlier uncommitted user-facing changes remain in the working tree.

## Suggested next prompt

Use the contributor workflow on one unfinished passage and give UX feedback. For model quality, explicitly budget one reconstruction and one assisted run in an isolated profile, then assess dictionary/structure/morpheme support, human corrections, unresolved text and resource use with the checked-in rubric. Keep routine regression tests free of paid inference.
