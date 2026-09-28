# Demo readiness — 2026-09-28

## Goal

Prepare/cache first search in the background, restore the real Navarro dictionary
tab online, and enable hosted AI/grammar correction using the maintainer's private
local Codex login, then redeploy for tonight's demonstration. Preserve all earlier
draft/completion/PDF corrections.

## Files inspected

Agent index/current-state/repo-map/open-questions; lexical search UI/context;
Python adapter/worker/index service; dictionary site/transform/bridge; hosted
runtime/HTTP/store/idle; desktop provider/analysis/grammar/draft services; deployment
scripts/container definitions and their tests. Official Codex auth documentation:
https://learn.chatgpt.com/docs/auth (headless login-cache transfer).

## Files changed

- Search: Python service/worker/adapter/new `structure_warmup.py`; lexical UI,
  useStudio/context/recovery; RPC allowlists; cache/thread and browser tests.
- Dictionary: existing site origin/CSP/HTML transform, React URL/message checks,
  authenticated HTTP routes and runtime status; Node/browser/HTTP tests.
- AI: new `server/ai.cjs`, server capability/config/store/idle integration,
  browser snapshot adoption after acceptance, shared provider work tracking,
  Docker Codex 0.153.4 and private persistent home; credential installer/Make
  target and deployment tests. Shared model config is admin-only; no credentials
  enter Git/images/browser/HTTP parameters. Normal deploy preserves remote refresh.
- Contributor/deploy/security docs and agent state/map/log/handoff.

## Commands and results

- `npm run build:app`, `npm run format:check`: passed.
- `npm test`: 250 passed; `npm run test:desktop`: 273 passed.
- Focused dictionary/rendered-lookup Playwright: 19 passed.
- Hosted PostgreSQL suite: 65 passed, 6 optional skips; new AI/idle cases included.
- Compiled real hosted editor + actual dictionary search + AI controls: passed
  with disposable DB/application state; no paid provider generation/source edits.
- `npm run test:codex-tools`: corrected scoped catalog passes; simulated API only.
- Python rendered-structure tests: 11 passed; warmup/cache tests: 2 passed.
- Deployment fixtures: credential 1, release 7, operations 13 passed.
- Full Python suite running; live capture/deployment/verification pending.

## What worked / failed

Original production dictionary_status explicitly disabled the site. Both server
and browser assumed the desktop custom protocol. The new shared site serves only
allowlisted authenticated assets, preserving row/dataset identity.

Index source caching already existed, but cold creation blocked the serial worker
and drafts did not survive restart. Dedicated background jobs and separate durable
overlays remove that dependency; incompatible keys never authorize reuse.

AI acceptance needed a PostgreSQL adapter, not merely removing the hosted denylist.
Regression tests prove claims, attribution, repeat acknowledgement and preservation
of later edits. Two new test expectations initially assumed seed version zero and
a different claim error code; corrected to existing contract. Compiled browser test
initially used role=tab for a button; corrected selector and passed.

## Remaining questions / next prompt

Finish live deployment with a full backup; verify private Codex authentication and
scoped tool inventory, actual production Navarro search, warmed query latency,
AI controls and exact pre/post research snapshot parity. Do not infer historical
linguistic correctness from tool connectivity or generation smoke checks. Full
Python results and final release/backup identifiers belong below when available.


## Pre-merge CI correction

CI's full new-source workflow exposed an omitted `structure_prepare` entry in the
Node Python-worker allowlist, plus speculative warmup racing source creation.
Added the missing route; preparation defers while the editor is busy and treats
stale warmup as a retryable background state without initiating editor recovery.
The full-editor fixture now asserts an actual successful warmup RPC, and the
new-source fixture reports method/error code on failed HTTP operations. Both real
compiled browser workflows now pass together (new source, PDF, regions, saved
reading, reload, submission; dictionary search and hosted AI controls). The third
warmup unit test preserves foreground staleness checks while ignoring speculative
staleness. No check was weakened.


The next CI run exposed an existing PDF-cancellation test race: descriptor closure
was observed before the pipeline rejection reached the test's catch. Await the
tracked transfers before asserting the same exact premature-close error. The PDF
implementation and assertions remain unchanged. The Linux production-image Codex
preflight already passed authentication, 14 analysis/6 grammar scoped tools, and
one six-output-token connectivity response with no research data or tool writes.

The rendered-lookup context test now counts only search/resolve requests; the
new independent project warmup has no passage context and must not be counted as
a user lookup. The original two requests and exact source/passage assertions remain.

The minimal two-browser transport fixture also raced its asynchronous selection
load against Playwright fill (amen was inserted into the stale edit). Disable its
textarea during selection loading, so edits begin only after the requested
passage is ready; preserve all conflict/recovery assertions. This fixture is
separate from the compiled React editor.

## Final test boundary

Final PR head `3fafafd` passed both complete Checks runs (36451953405,
36451961968) and hosted CI (36451961980). The focused final lookup run passed
all 12 tests; the two-browser transport fixture passed locally. Warmup has three
passing tests and the real rendered-structure suite has eleven.

The extra local full real-corpus suite was not clean: 386 tests, 11 failures and
106 errors. It ran across implementation edits; 98 source-preview subtests hit
expected STALE_ENGINE guards after that change. Other failures include older
corpus-sensitive UUID, translation label, shared lexeme, annotation spacing and
structure-sharing expectations. Representative UUID, label, annotation, structure
and shared-lexeme failures were reproduced from unchanged `origin/main` in an
isolated baseline against the same local corpus; they are not a new release pass.
Logs: `/private/tmp/studio-ai-python.log`, `studio-demo-baseline-python.log`,
`studio-demo-baseline-morphology.log`. Do not report the full local suite as passed.

## Deployment checkpoint correction

The initial merged release `b6ac637` stopped safely before activation: Codex's
preflight created executable symlinks below private `config/codex/tmp/arg0`.
Full backups now exclude exactly that disposable container runtime directory,
retaining login/history and rejecting symlinks everywhere else (including a
symlink replacing the temporary directory itself). A checkpoint regression test
verifies preserved credentials/research, omitted links and both manifest hashes;
the thirteen operations tests pass. No cache or research file was deleted.
The deployment guide's obsolete disabled-AI paragraph was also corrected.

## Live initialization follow-up

Release `a360fba` activated successfully. The independent full-backup checksums and
all 178 drafts/versions, both evidence documents, recovery and import receipts
matched exactly. Live browser QA found an early example-project AI status request
and a cold dictionary HTML/script race. AI status now waits for local project
readiness. Dictionary HTML starts search controls disabled until the upstream
script finishes loading its data. The compiled hosted test delays that script
explicitly, asserts both controls disabled, then verifies real search; it also
rejects AI status errors during initialization. Six dictionary service tests and
the compiled hosted workflow pass. The browser smoke initially selected a legacy
lexicon input; corrected it to the actual canvas's Adicionar peça control.
Before the initialization follow-up, actual production dictionary search returned
45 entries; two rendered searches returned 11/113 matches without preparation,
and the grammar dialog and authenticated Codex model discovery both passed.

## Final live outcome

- Runtime release: `ebabf874e3a9b6d8cc905392bacdf5238fb6fd77`.
- Corpus: `e707610a9f69a7b336c80f096a67e9a4ee0e4dfe`; grammar/dictionary:
  `c43c83ec6079b7747d39dbca3e2f577023665916`.
- Full checkpoint: `/srv/pydicate-studio/backups/predeploy-20260928T164934-9fdbf7`.
  Independently recomputed SHA-256 matches for database.dump/workspace-state.tar.gz.
- Production browser: real Navarro search 45 entries; two rendered searches
  1,177/468 ms, 11/113 results, neither preparing. Grammar repair dialog opens;
  Codex authenticated with six models. No page/API errors or blocked research
  writes. Original selection restored; drafts unchanged after browser QA.
- Read-only pre/post capture: all 178 draft/version records, both evidence
  documents, recovery archive and import receipt exactly unchanged.
- Final startup-fix hosted CI 36453872184 passed; broad Checks 36453872071 still
  running when recorded. Earlier PR full Checks both passed. Local startup-fix
  build and compiled hosted regression passed (including delayed dictionary
  script and no premature AI status request).
- Private ignored verification artifacts: `.local/demo-release/browser-report.json`,
  `production-ready.png`, `state-parity.json`, `backup-verification.json`,
  `deploy-final.log`, and `codex-preflight.log`. No secrets in committed evidence.

### Remaining boundaries / suggested next prompt

The requested fixes are deployed and verified. Live linguistic correctness of a
repair is not established by connectivity or UI checks. The older full-corpus
fixture/provenance mismatches above remain a separate investigation; do not alter
research data to make those tests pass. Suggested next prompt: investigate the
baseline real-corpus test mismatches in disposable copies with frozen engine/code,
keeping the production demo release and canonical editorial state intact.
