# Next working Studio — 2026-09-17

## Goal

Implement the user's next working authoring version in the existing application: all current Araújo structures, bidirectional editing, lexicon/Navarro, durable PDF evidence, actual providers, useful incomplete contributions, explicit source/review/Git operations, and three independent review/fix rounds. Preserve every pre-existing neighboring change and validate writes only on disposable corpus copies.

## Starting point and inspected files

Studio started clean at `0af3937` (the initial 0067-only model). The actual source contained 82 expressions, discovered from concrete source collections rather than a fixed UI list. oldtupicorpus `292a28722a1790abf3f3b93083c29fbd47b4ffd0` and nhe-enga `348686045bf0791c847be3cba1b15eaae7312a11` both had relevant dirty files; vscodetupy was clean at `d9db782`. Git histories/status and agent notes were inspected in all four repositories.

Read the agent index/state/map/open questions, supplied design/HTML inspiration, implementation boundaries and operation inventory. Inspected the complete `historic/araujo_catecismo_1686.tu.py`, `historic/lexicon.tu.py`, corpus `authoring/source_annotations.py`, `service.py`, records/MCP helpers, actual language operator/method implementations, `NavarroDB`/`tupi_only.db`, and VS Code/MCP context behavior. Inspected existing renderer/domain/hook, Python adapter/worker, Electron boundary/draft store and browser/native test infrastructure before extending them. Consulted official Codex/Claude integration documentation; provider sources and transport evidence are linked in [providers.md](../../design/providers.md).

## Files changed

- `src/App.tsx`, `useStudio.ts`, shared domain types/model/authoring contracts, source pane and main styles; new `AuthoringEditor`, `NewPassageDialog`, `PdfEvidence`, `SourceRecovery`, `AssistantPanel`, evidence/AI models and theme/task styles.
- `electron/main.cjs`, preload/worker/validation; new next-service/project-watch, durable evidence and Codex/Claude/context/RPC/provider-history services and focused tests.
- `python/adapter.py`, worker; new concrete authoring/runtime/service modules, real Navarro search, complete audit and corpus/identity/metadata/write-back tests.
- `scripts/check-project.py`, production `smoke-next.mjs`, retained example smoke adjustment, authenticated provider probe and independent critic scripts/tests.
- Package/lock version 0.2 with exact PDF.js dependency; README, Python/Electron contracts, current scope, dependency manifest/patches, coverage/query/provider/native evidence, three review reports and agent documentation.

The [repo map](../repo-map.md) links module responsibilities. The supplied product design and old example fixtures remain available; the application was not replaced with a disconnected prototype.

## Commands and results

- `npm install pdfjs-dist@5.4.624`; `npm version 0.2.0 --no-git-tag-version` (no tag/commit).
- `npm run check`: formatter, production build, 17 domain tests, 62 Electron assertions and 48 Python tests passed. A synthetic SQLite fixture connection warning was then fixed and its three tests rerun successfully.
- `npm run test:e2e`: 23 browser scenarios, including actual PDF.js and explicitly simulated delayed/stale/project/conflict contracts. One old conflict-undo handler mismatch was fixed and rechecked; the final full browser suite passed 23/23 in 23.1 seconds. Node critic crash probes are excluded from browser discovery and run separately; browser discovery was rechecked at exactly 23 scenarios.
- `npm run build`; `node scripts/smoke-next.mjs`: 11 production native workflows passed, including reading-only drafts, two restarts, reserved identity migration, actual Navarro lexical creation, source conflicts, PDF regions and provider configuration. No renderer errors; original source/lexicon/reference hashes unchanged.
- `node scripts/smoke-desktop.mjs`: retained original example, isolated renderer/CSP, image consultation and save/reopen passed.
- `npm run doctor`: selected environment matches Python 3.14.4 and all 130 recorded relevant dependency files. Clean HEAD archives plus checked-in dirty patches were independently reconstructed and verified; deliberate mismatch/missing-clone checks failed as expected.
- `npm run audit:araujo`: 82/82 on every core fidelity measure and source/dependency/UI/integration-matched native UI evidence; no exceptions. No historical write.
- `python3 -B scripts/critic-fidelity.py`: 82 independent direct-engine comparisons and 560 actual TypeScript scope replacements passed. Independent production all-expression script covered two edited candidates per expression, preview/reimport and exact undo.
- `node --test tests/critic-ai-restart.test.cjs`: three independent child-crash/history corruption cases passed; provider tests include 35 malformed-schema variants with byte preservation.
- Real provider probe: Codex authenticated, streamed and persisted a minimal linguistic response. Claude authenticated but `/v1/messages` returned HTTP 400 for insufficient credit. No corpus content was used in that minimal probe. Local MCP source context/lexical searches were separately exercised.
- `git diff --check` and final formatter check passed. Upstream statuses match the inspected initial state; vscodetupy remains clean.

## Review and fixes

The independent critic conducted [fidelity](../../reviews/round-1-fidelity.md), [contributor workflow](../../reviews/round-2-contributor-workflow.md) and [persistence/integration](../../reviews/round-3-persistence-integration.md) rounds. All 13 findings were fixed and independently verified. Fixes include TypeScript grouping, runtime-role display, helper/alias contracts, duplicate identities, source-note import, honest coverage, reading-only new drafts, own-write alerts, metadata conflict comparison, two multiline source anchors, and corrupt AI history validation.

The all-expression UI run honestly combines 41 successful initial rows and 41 resumed rows. Its first attempt exposed 0028/0029 writer failures and was also invalidated by a concurrent audit-generator edit. Those stale-engine interruptions are preserved as evidence, not recast as compatibility failures. Final backend tests additionally preview/reimport all 82 edited expressions on the fixed writer. Future UI resume/coverage merge requires source, dependency and integration provenance to match.

## What failed or remains limited

The initial integration omitted new Python method names from a worker allowlist; native tests caught it and the bridge/contract regression is fixed. Old and new malformed persistence/race cases are recorded in the critic reports, along with their fixes. The build has a non-failing large-chunk notice because the offline PDF renderer/worker is bundled.

Claude message generation remains externally blocked by billing. Automatic approval review separately rejected the critic's request to send corpus context to a provider; that request was not sent and is not counted as successful generation. Provider contract tests are explicitly simulated. No credentials were put into renderer/source/version control.

Actual historical PDF appearance/region scholarship and linguistic adequacy remain human review tasks. PDF tests use a vector fixture; rare codec/font resources are not certified. AI receives textual evidence plus PDF locators, not pixels. No installer, bundled interpreter, private evidence archive or automatic remote Git publishing was produced. Source comments/IDs and exact local state persist, but a Git patch alone does not contain managed PDFs, local drafts or AI history. Ambiguous unmarked duplicates and comment-bearing multiline metadata anchors require explicit review.

## Suggested next prompt

“Open this version with my actual Araújo PDF, mark the first real passage regions, and review the reading/analysis workflow with a contributor. Keep source/reference approval explicit; after Claude credit is available, verify that provider with a reviewed minimal payload.”

All implementation changes remain local and uncommitted. No historical corpus edit, reference approval, project commit, push or memory update was performed.
