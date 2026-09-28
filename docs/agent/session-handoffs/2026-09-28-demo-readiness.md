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
