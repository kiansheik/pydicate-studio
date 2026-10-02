# Grammar repair transport and readable output — 2026-09-30

## Goal

Fix repeated `WORKER_UNAVAILABLE` rollback and fragmented streamed responses in
Corrigir gramática; remove redundant work without skipping regression checks.

## Files inspected

Required agent guides; Python worker/adapter/background structure warmup;
hosted worker lifecycle; grammar repair, analysis service/store and provider tool
events; AnalysisSupport and analysis domain; production rollback receipts and
filtered timing/identity for jobs `d780d0c0-193d-45b1-ad20-37fd0ffa9ea6` and
`5a5c62f8-6157-4f35-b4ce-e951aef48b43`. No provider inference was started.

## Files changed

`python/worker.py`, `electron/python-worker.cjs`, `server/studio.cjs`,
`electron/grammar-repair.cjs`, `electron/analysis-service.cjs`, `src/components/AnalysisSupport.tsx`,
`src/domain/analysis.ts`, `electron/provider-codex.cjs`, their focused tests and
these agent guides.

## Findings and implementation

Live receipts show malformed JSON during the fresh worker's `open_project`,
not a linguistic exception or OOM. Ordinary repeated live opens and four patched
disposable opens passed; the failure is intermittent. A real OS reproduction with
a slow reader and harmless signal truncated the old unbuffered writer's 2 MB
response to 65,537 bytes. The fixed writer delivered all 2,097,214 bytes as valid
JSON. The deterministic main-loop fixture also covers partial UTF-8 and interrupted
writes. Strict JSON parsing remains; bounded errors now retain parser reason,
byte count and start/end snippets. Same-fingerprint reloads retain a healthy
worker but replace a failed one without reseeding drafts.

The UI previously accepted `analysis_get` only when its timestamp exactly matched
the earlier `analysis_list`; during streaming it discarded the newer full detail
and rendered only the list's final 20 events. Newer details now win, with stale,
foreign-project and resumed-attempt guards. Unfinished bold/code markers are not
trimmed. History explicitly separates applied edits from discarded attempts;
raw and wrapped rollback/failure events produce coherent activity labels.
The Codex adapter now adds paragraph boundaries between distinct assistant
message blocks, preserving fragments and completion tails within each block.
The output budget still counts provider characters rather than display separators;
completed-only messages now obey the same bound.

`render_candidate` now uses the current worker and its before/after source
freshness checks. Only stale/unavailable read errors trigger one reload/retry.
The instructions no longer require an extra reload after an already verified
edit. Edit, rollback and final full-corpus checks remain intact.

Successful grammar result, visible receipt/verification and idempotent replay
receipt now commit in one transaction, removing one whole-history rewrite.
The cancellation test exposed an existing finalization bug: a cancelling job's
drained check could not record its result. Only that final check may now record
under the same exact attempt/owner lease, allowing cancellation to finish; late
tool results remain rejected.

## Commands run and results

- Two new Python protocol regressions, the existing real worker JSONL subprocess
  check, and seven Node transport/hosted recovery checks pass.
- Combined grammar-repair and analysis-service suites: 59 pass, including four
  fresh-contrast/recovery checks, atomic result/replay and late cancelled-read
  tests. Local MCP IPC required sandbox escalation.
- Analysis domain: 11 pass. Six focused real-hook browser checks cover streaming,
  unfinished formatting, rollback history, summary refresh/resume and coalescing.
- Simulated agent-runner/provider suite: 31 pass, including separate assistant
  blocks, completed-only text and output-budget boundaries; no inference calls.
- `npm run typecheck`, `npx vite build` and `git diff --check` pass.
- Read-only live worker probes and filtered receipt inspection; disposable copies
  of current live source/grammar roots, initialized as separate fixture repos.
  The proposed nominal-absolute patch produces `te'õmbûera` and enclosing
  `te'õmbûeratyma`; `eo` stays `te'õ`; possession before/after derivation stays
  `nde re'õmbûera`. Comparison: 154 checked, zero changed surfaces/annotations,
  zero baseline/new reference issues and zero source coverage changes.
- Full hosted integration passes in 17.9 seconds with disposable PostgreSQL,
  actual Chrome and copied real engine: UI submits the fixture repair, checked
  `abá` → `kunhã` appears in the editor and the job reaches ready-for-review.
  Human drafts and source bytes remain unchanged; no page errors. Fixture DB
  stopped and temporary directories removed.
- Main release `d9f75a8c86223acdf1911002f8b273b7781006db` deployed in 52.7s;
  checkpoint `20260930T230325-9afb05`. All 145 grammar/corpus files and six evidence
  manifest/PDF files retain exact before/after hashes. Live browser shows the
  reported passage at visible 114 with two reverted edits, zero applied edits,
  and correct rollback activity. Its read-only harness blocked an automatic
  scroll-position preference save; no research/provider operation ran. The first
  harness's blanket no-write assertion flagged that expected preference attempt;
  it now distinguishes only that exact scroll-only payload, including the bridge's
  pending-passage `beforePassageId` routing metadata.
  The corrected final browser check passes with no page errors and only that
  intentionally blocked preference write; the screenshot was visually inspected.
- Final paragraph follow-up `771344f629326e44bd3f1db3d0a9e40b91a6a49b` deployed
  in 52.5s; checkpoint `20260930T231209-840e45`. Exact research/evidence hash parity
  passes again. Inside the deployed Linux container the synthetic interrupted-write
  repro produces 65,537 invalid bytes with old `print()` and 2,097,214 valid bytes
  with the fixed writer. No corpus data enters that stress test.
- Final read-only health: three sources, 154 lines, zero divergences/failures,
  seven pending drafts, 321 morphemes, no active repairs; 2.788 seconds.
  Runtime image/health independently checked. Deployment space came from removing
  four explicitly named, unused older app images; current/recent rollback images,
  all research volumes and backups were retained.

## What worked / what failed

The exact failed repair is a valid regression fixture; no need to pay for another
model run just to test transport. Original production code, drafts, source
references and job records were preserved. The attempted full job export was
rejected by automatic approval review; diagnosis proceeded with a filtered
expression/identity/timing summary, excluding its corpus baseline and full output.

## Remaining questions

One production analysis record is 40,140,716 bytes. A tool call now uses six
whole-record loads and two durable rewrites instead of seven and three, before
provider events. Broader storage partitioning/event compaction is separate from
the transport fix. No claim that provider reasoning will become
instant. Existing failed repairs retain their state for explicit continuation.

## Suggested next prompt

Resume the saved pluriform repair after deploying the workflow fix; verify its
target and all corpus references, keeping the selected subtree and enclosing
expression unchanged. Profile larger analysis history storage separately.
