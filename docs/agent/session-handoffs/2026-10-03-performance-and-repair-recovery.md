# Performance and subtree repair recovery — 2026-10-03

## Goal

Diagnose repeated interrupted subtree grammar repairs, improve render/search/UI
responsiveness, and retain bounded operational diagnostics. Preserve research,
history, credentials and the user's saved `moingobé` attempt; do not run inference
or change linguistic rules as part of performance validation.

## Evidence and implementation

SSH became available after the user changed networks. The live `921b502` container
restarted at 13:03:55 UTC after V8 reported `Reached heap limit` at roughly 1 GiB,
with `ValueDeserializer`/`Message::Deserialize` in the stack. The user's partial
reply stopped at 13:03:51; startup recovered that exact job as interrupted at
13:04:00. Kernel OOM logs were empty. Root and archive disks were 49% and 52%
used, with 38 GiB and 28 GiB free respectively; this failure was memory pressure.

The project had 23 jobs, a 6.47 MB packed index, 649 payload references and
46.56 MB of unique serialized payloads. Eager inflation and whole-project
`structuredClone` amplified these values on every progress save/history read.
The compatible store now verifies payloads, hydrates independent values on
access, caches at most 64 MiB of serialized payload text, and shallow-packs
unchanged payload references. Digests, atomic persistence and complete history
remain intact. The cache budget is not a total-process-memory bound.

On a private copy of the actual record, with a 1 GiB Node heap, two concurrent
history reads plus one progress save took 1,270/1,117/1,062 ms before versus
202/173/158 ms after (final rerun); process peak RSS fell from 1,387,056 to
478,048 KiB (~66%).
These are local fixture measurements, not claims about browser/network latency.

Shutdown admission now accounts for capture, scheduled dispatch and active
attempts; close fences new execution and drains admitted work. Selected-target
diagnostics retain the actual containing expression/selection separately from
the isolated target tree, avoiding accidental repeated node-ID matches.

The UI computes pending draft contexts once, reads search projections lazily,
memoizes warmup identity and only evaluates morphology after selecting a
descendant. A 720-passage synthetic projection improved from 28.13 to 0.18 ms;
browser tests assert zero extra morphology evaluations at root and one reused
evaluation after descendant selection.

New server diagnostics sample every five seconds and persist summaries every
30 seconds under the state directory's `diagnostics/`. Only numeric metrics and
fixed operation labels are retained: process/V8/cgroup memory, CPU, event-loop
delay, queue wait/execution, worker pressure, PostgreSQL pool counts and state filesystem available/total
bytes (one async statfs per sample; no recursive size walk).
Recognized diagnostic files expire after seven days and at a 32 MiB cap.
Research/audit retention is unchanged. Writes are serialized, best effort and
nonfatal. The existing authenticated admin report/panel displays current values;
public health probes do not access diagnostics.

## Files inspected / changed

- `runtime/analysis-{service,store}.cjs`, `grammar-repair.cjs` and corresponding
  tests: inspected and changed.
- `src/domain/{structure-drafts,grammar-diagnostic}.ts`, their tests,
  `src/useStudio.ts`, `src/components/useMorphemeTrace.ts`, canvas/shared-tree
  browser tests: inspected and changed.
- `server/{index,http,studio}.cjs`, `server/public/panel.js`: integration changes;
  new `server/{diagnostics,queue}.cjs` and focused tests.
- `python/{adapter,authoring_service,authoring_runtime,lexical_search}.py`,
  `python/tests/{test_adapter,test_lexicon_catalog}.py`: freshness/catalog changes.
- Deployment/light-maintenance/backup code, database/store, Python search and
  freshness paths, current live container/logs and private copied records:
  inspected. Private evidence is in `.local/subtree-repair-20261003/` (ignored).
- Agent current state/log and this handoff: updated; pre-existing guide rollout
  documentation and generated/untracked artifacts are preserved separately.

## Commands and verification

- `npm run build`, `npm run format:check`, `git diff --check`: passed.
- `npm run test:runtime`: 298 passed; `npm test`: 292 passed.
- Store independently reviewed and tested: 14 passed; lifecycle/store combined
  focused run: 48 passed. Corruption, mutation isolation, routing/digests,
  replacement/deletion, concurrent reads and shutdown races covered.
- Four focused actual-browser tests passed for morphology request count,
  cancellation/stale response and shared declaration namespace behavior.
- Diagnostic collector/queue/HTTP focused tests: eleven passed, including
  retention, restart, privacy, storage failure, missing Linux metrics and admin
  authorization and real Chromium admin/contributor visibility. Full hosted suite
  with disposable PostgreSQL: 128 passed, ten conditional tests skipped. The
  diagnostics browser tests were separately enabled and passed; the fixture
  database was stopped and removed.
- Bounded authenticated read-only live baseline: parse ~0.7 s, evaluate
  ~1.4–1.7 s, `ikó` lexicon search ~2.8 s, history list 2.3 s. Network and server
  time are combined. No provider calls, source edits or draft saves.

Exact freshness guards now omit branch/status metadata commands while retaining
Git root/HEAD/path enumeration and exact content hashes. Paired local fingerprint
scans improved from ~0.18–0.20 s to ~0.09–0.11 s, with equal fingerprints.
Twenty-six adapter/lookup-refresh/encoding tests passed, including same-size
edits, untracked add/remove, deletion and HEAD changes.

Ordinary lexical search now caches up to eight complete serialized catalogs with
an 8 MiB total budget, keyed by corpus/project/fingerprint/source/resolved line.
Both exact-content guards still run; results are detached and queries/limits are
ranked fresh. Definition-tab search retains its separate scope/import checks.
`lexical_search.py` is explicitly part of the runtime fingerprint. Twelve catalog/
ranking checks pass. A real local catalog is 423 entries/252,677 bytes; equivalent
`ikó` results took ~0.69–0.72 s cold and ~0.19–0.20 s warm. The child has a timeout
but no separate stdout byte limit; oversized catalogs are not retained in cache.

The isolated release build passed. Portable Python discovery ran 458 cases:
214 passed and 244 optional corpus cases skipped because that clean worktree has
no sibling research repositories. The focused real-corpus cache/scope/refresh
checks passed separately (17 cases including catalog/ranking). An additional
exhaustive all-corpus run in the original checkout was intentionally interrupted
while walking every scoped edit preview; it is not reported as completed.

## Release publication and deployment

Isolated branch `fix/performance-history`, code commit
`912115346163bd0c125b55affffbbe38d6526715`, contains only these 30 intended files.
Automatic approval review rejected GitHub publication as an unconfirmed source
export destination; nothing was pushed. The separately approved safer rollout
uploads a verified private Git bundle to the already authorized Hetzner server,
then uses the existing light-deploy build/idle/switch path. The private release
is reproducible from the local branch and retained server bundle. Future GitHub
publication requires explicit user approval; do not silently push it or assume
upstream main contains these changes. During preparation an accidentally staged
local dependency symlink was removed from the unpublished commit before export.

The wrapper rejects queued/running/cancelling analyses, archives and verifies the
complete analysis records directory, retains the standard database checkpoint,
and compares all critical research file hashes/modes/ownership and content hashes
of nine research database tables across the switch. It sets `GIT_OPTIONAL_LOCKS=0`
to prevent root Git reads from refreshing application-owned indexes. No pruning,
dependency sync, credential replacement or provider request occurs.

## What failed / limits

- Initial SSH timed out on the wrong user network; retry succeeded.
- Fixture Unix sockets initially hit sandbox `EPERM`; the permitted rerun passed.
- First HTTP probe had a relative module-path error after login; fixed, then all
  bounded read-only probe operations succeeded.
- A passing build/health check is not proof that the next provider attempt will
  produce the intended linguistic correction. The saved attempt is not resumed.

## Remaining questions and suggested next prompt

The private release is deployed and verified; GitHub publication remains
unapproved. The saved repair remains blocked with its partial work intact.
Use the bounded metrics to distinguish worker evaluation, queue contention,
event-loop pauses and memory growth under real multi-user use. Suggested next
prompt: “Review the last day of performance diagnostics and identify the largest
remaining measured render/search bottleneck without weakening freshness checks.”


## Live rollout result

Deployed private code release `912115346163bd0c125b55affffbbe38d6526715` through
light-deploy in 41.8 seconds. Health confirms that SHA; the new container has zero
restarts. Complete analysis archive:
`light-backups/performance-20261003T133535-bb4aeb/analysis-records.tar.gz`;
standard database checkpoint: `light-backups/20261003T133603-edb3b3/`.
The 356 analysis files, 614 provenance files, seven evidence files and all 147
files in the inspected corpus/engine roots match before/after bytes, modes and
owners. Nine research tables match exactly, including 278 drafts and 2,679
revisions. Queued/running analysis statuses were absent before switching.

Same bounded public authenticated probes, milliseconds (network included):

| Operation | Before | After |
| --- | --- | --- |
| Selected subtree parse | 712 / 736 / 700 | 575 / 591 / 632 |
| Selected subtree evaluate | 1413 / 1734 / 1669 | 1161 / 1419 / 1430 |
| Variable search `ikó` | 2804 / 2874 / 2849 | 2720 cold / 637 / 636 warm |
| Analysis list | 2335 | 1861 |
| Saved subtree analysis | 1933 | 745 |

All probes returned HTTP200 with no evaluation failures. Query caching preserves
results in the focused equivalence tests; this live sample measures latency, not
long-term multi-user capacity. Diagnostics report available/ok, sample process
RSS ~257 MiB and heap ~111 MiB, with cgroup OOM kills zero. State filesystem shows
~36.3 GiB available after the image build. Anonymous admin report returns401.
No provider call was made and the saved `moingobé` analysis was not resumed.
