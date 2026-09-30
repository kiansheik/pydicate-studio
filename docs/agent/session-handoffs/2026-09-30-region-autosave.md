# Region autosave — 2026-09-30

## Goal

Remove **Salvar regiões** and persist region/view edits automatically, including
draw, move, resize, removal and reading order, without losing work on navigation.

## Files inspected

Required agent guides; `PdfEvidence.tsx`, domain evidence types/cache recovery,
the evidence service's source manifest locking and stale checks, PDF browser
fixtures and the actual source pane. Existing saves are guarded by a source-wide
revision, so concurrent edits to unrelated passages previously conflicted.

## Files changed

`src/components/PdfEvidence.tsx`, `src/domain/evidence-autosave.ts`
and tests, `src/domain/evidence.ts`, `electron/evidence-service.cjs` and its tests,
`tests/pdf-evidence.spec.ts`; `AnalysisSupport.tsx`, `analysis-service.cjs` and
focused capture tests; relevant agent and evidence contract documentation.

## Implementation

Region saves gain an optional exact passage baseline fingerprint, bound to the
selected PDF and stored own-passage geometry/view. Another passage's save may
advance the source revision without invalidating this baseline. A changed own
passage or selected PDF still rejects stale writes. Attach/relink retain strict
source-revision checks; inherited guides never enter the owned-region baseline.

The renderer debounces completed edits for 400 ms and serializes each passage's
writes; active gestures are paused until pointerup. Pending work
and responses stay bound to the original project/source/passage. Local recovery
caches remain available; analysis preparation flushes the same saving mechanism.
Both analysis capture checks use the optional exact passage fingerprint, with
strict source revision behavior retained for legacy callers. No analysis starts
because of an automatic region save.
No historical source, reference approval or PDF bytes are changed by these code
edits or by routine browser verification.

## Commands run / results

Targeted source searches and reads. Backend: `node --test
electron/tests/evidence.test.cjs` — 16/16 pass; syntax and diff checks pass.
`npx vitest run src/domain/evidence-autosave.test.ts src/domain/evidence.test.ts`
passes all 13 coordinator/evidence cases. Five focused analysis service checks
pass with fixtures only; no provider requests.

The actual PDF browser suite verifies 27 cases: first 25 passed, and two obsolete
guide-only save expectations were corrected to assert no write before user edits;
both then passed. New cases cover delayed acknowledgements, in-flight coalescing,
navigation before/during save, pointerup gating and failure/retry. Existing cases
retain geometry, order/deletion, view, scans, restart and analysis preparation.
Commands: `npx playwright test tests/pdf-evidence.spec.ts --config=.local/shared-tabs.playwright.config.ts --workers=1 --reporter=line`, then a targeted
`--grep 'an existing unmarked passage|next-passage guides stay'` rerun.
`npm run typecheck`, `npx vite build`, targeted Prettier and `git diff --check`
pass. Deployment/live results remain to be recorded.

## What worked / what failed

The existing source manifest writer already serializes and atomically persists
changes. A passage baseline removes unrelated-save collisions without bypassing
same-passage concurrency checks. Simply attaching an effect to every dirty state
would incorrectly save inherited caches and allow navigation/response races.

## Remaining questions

Deploy and verify the live controls without altering research regions just for
a test. Preflight freed 2.124 GB of unused build cache older than one hour after
removing two unused oldest Studio image tags, retaining fresh dependency cache,
running/recent rollback images, research and backups; 3.5 GB available afterward.

## Suggested next prompt

Check region autosave during ordinary collaboration, including rapid passage
switches and temporary connectivity loss; retain local recovery on genuine
conflicting edits.
