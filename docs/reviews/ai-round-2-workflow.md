# AI authoring critic round 2: contributor workflow

Independent review of the uncommitted AI milestone on 2026-09-17, after the
round-1 integrity fixes. This review covered source preparation, batch selection,
passage navigation, candidate inspection, sense feedback, evidence, draft
acceptance, undo and the ordinary source-review boundary. No paid generation or
original corpus/reference write was made.

## Findings requiring correction

1. **P1 — Answering a focused question selects the wrong alternative.**
   `AnalysisSupport.tsx`'s **Responder** handler selects the first candidate of
   the job and ignores the question's `candidateId`, `candidateRevision` and
   `nodeId`. The service correctly records those fields. A browser fixture with
   two alternatives asked about `candidate:alternative-b`, revision
   `candidate-revision:b`, node `root`; the submitted answer instead referenced
   `candidate:job:1`, revision `candidate-revision:job:1`, with no node binding.
   A contributor who answers a sense question can therefore revise a different
   interpretation without realizing it.

   Fix: load and select the question's exact candidate revision, retain its
   node binding in the feedback submission, and explicitly reject stale question
   references. Do not substitute another candidate when the referenced revision
   is unavailable. Questions without a candidate should remain job-level.

2. **P2 — Batch preparation differs from single-passage preparation.**
   The picker requires nonempty diplomatic text, although the service also
   accepts tentative Navarro text or a saved own PDF region. A passage with
   only the tentative reading `aba` disappears from batch selection. In
   addition, `submitBatch` omits `includeImages` even when the visible checkbox
   is checked and the support summary promises recortes for the next send. The
   reproduced two-item request contained no image-selection field in either
   item. This is especially confusing for contributors preparing passages from
   scans rather than already transcribed text.

   Fix: use consistent preparation eligibility, including saved own regions;
   make the batch image choice explicit and honor it for every selected input.
   Validate saved evidence before dispatch, and explain unavailable or unsaved
   regions rather than silently falling back to coordinates.

3. **P2 — A normal refresh makes a saved conversation disappear.**
   The job-detail cache is invalidated only by `job.updatedAt`. Composer saves
   increment the conversation revision without changing the job. The real
   `analysis_list` returns summary conversations with `turns: []`;
   `mergeAnalysisDetails` then rejects the cached conversation because its
   revision is older and replaces the visible transcript with the empty
   summary. Existing browser fixtures initially hid this defect by returning
   full list turns and shared JavaScript objects instead of IPC clones.

   The independent probe emulated both real boundaries. It observed **1 turn
   before typing, 1 after typing, 0 after an ordinary analysis refresh**, while
   the saved record still had **1 turn** and the composer text remained intact.
   Navigation or another job's progress can thus make a contributor think
   earlier work has been lost.

   Fix: invalidate/fetch conversation detail when its revision changes and
   preserve the transcript until the matching authoritative detail arrives.
   Add a regression using summary-only list responses and independently cloned
   bridge results.

4. **P2 — Unloaded older results falsely claim no image evidence.**
   `analysis_list` deliberately omits the complete evidence packet, but every
   job's **Entrada salva e atividade** renders missing evidence as zero regions
   and `sem pixels enviados`. Opening that detail does not fetch the job. The
   separate load button is offered only when a job has candidates, so an older
   source interpretation with no candidate has no path to its full activity.

   A browser probe using the real summary shape saved one region and one image
   for an older `translate-source` job. Expanding its activity displayed
   **0 regions; no pixels**, and the request trace fetched only the newest job.
   This misstates what was supplied to the provider and hides historical tool
   results from review.

   Fix: load detail for any job when its saved input/activity is opened. Until
   detail is available, distinguish unknown/loading from an actual empty
   evidence packet; show a retry if retrieval fails.

## What the workflow already demonstrates

- Source preparation separates diplomatic text, tentative Navarro spelling,
  probable meaning and constraints from the existing reviewed target. The
  save-and-submit path awaits evidence and draft persistence; a failed save
  leaves input intact and creates no job.
- Fonte/IA remain in the support dock, the builder stays central, and completion
  does not steal focus. Composer text survives passage navigation and restart.
  At 650 × 900 the support pane has no horizontal page overflow; its ordinary
  buttons and fields remain keyboard reachable.
- Candidate projection is visibly read-only, with morphemes, expression code,
  senses/evidence and independently evaluated loose pieces. Exact, spacing/case
  and accent comparisons remain distinguished; a matching form is not approval.
- Explicit **Usar no rascunho** leads to the ordinary source review and supports
  undo while retaining acceptance provenance. The tested path does not publish
  source or approve ground truth automatically.
- The production Electron fixture uses the actual managed PDF, selected
  dictionary and worker, and checks real region pixels, feedback alternatives,
  draft acceptance, named lexical preview and restart. It forbids provider
  generation at the provider entry points.

## Commands and artifacts

- Read the full implementation request, required agent docs, shared authoring
  contract, round-1 report, `AnalysisSupport.tsx`, `SourcePane.tsx`,
  `DictionaryTab.tsx`, relevant `App.tsx` routing, domain analysis types,
  analysis-service input/list/question handlers, native smoke and browser
  fixtures.
- `npx playwright test tests/analysis-workspace.spec.ts --reporter=line`:
  **6 passed**. The initial sandbox could not listen on loopback (`EPERM`);
  the approved local-listener retry passed.
- `node /tmp/pydicate-critic2.cjs`: reproduced findings 1 and 2 using only the
  simulated browser bridge. Report: `/tmp/pydicate-critic2-report.json`;
  screenshots: `/tmp/pydicate-critic2-question.png` and
  `/tmp/pydicate-critic2-narrow.png`.
- `node /tmp/pydicate-critic2-conversation.cjs`: reproduced finding 3 using
  Electron-like cloning and the real list-summary shape. Report:
  `/tmp/pydicate-critic2-conversation-report.json`; screenshot:
  `/tmp/pydicate-critic2-conversation.png`.
- `node /tmp/pydicate-critic2-history.cjs`: reproduced finding 4 with the
  summary-only service shape. Report:
  `/tmp/pydicate-critic2-history-report.json`.
- Inspected the production fixture's report and screenshot at
  `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-analysis-native-waoNsz/`.
  It records zero provider calls, no remote requests/errors, unchanged original
  files, and successful saved-input/evidence/acceptance/restart assertions.
  Dependencies: corpus `292a28722a1790abf3f3b93083c29fbd47b4ffd0`,
  grammar `348686045bf0791c847be3cba1b15eaae7312a11`; these revisions alone do
  not describe their dirty contents, which the audit fingerprints separately.

## Remaining verification boundaries

The deterministic native path validates integration, not autonomous linguistic
quality. No separately budgeted live-provider experiment was run. Synthetic
PDF fixtures do not settle the previously recorded historical font/codec
coverage limitation. Persistence/crash/concurrent-client isolation belongs to
the following independent critic round.

## Post-fix verification

All four findings were addressed and independently rechecked before round 3:

- The exact-question probe now submits `candidate:alternative-b`,
  `candidate-revision:b` and its bound `root` reference. The permanent regression
  also changes that candidate's revision and confirms a stale-question error
  without another submission.
- Batch selection now includes tentative-only and own-region preparation, keeps
  inherited guide regions out, and propagates explicit image consent. The
  regression removes a requested region before submission and verifies that no
  batch is dispatched; restoring it submits both items with `includeImages:
  true` and the saved evidence revision.
- The conversation probe now reports **1 turn before typing, after typing and
  after a summary refresh**. The unsent composer and saved history remain intact.
- The older source-only job now loads on expansion and reports **1 region;
  images supplied**, matching its saved packet. Its `analysis_get` appears in
  the trace alongside the newest job.
- `node /tmp/pydicate-critic2-question-fixed.cjs`,
  `node /tmp/pydicate-critic2-conversation-fixed.cjs` and
  `node /tmp/pydicate-critic2-history-fixed.cjs` all completed successfully;
  corresponding `*-fixed-report.json` files preserve the post-fix observations.
- `npx playwright test tests/analysis-workspace.spec.ts --reporter=line
  --output=/tmp/pydicate-critic2-postfix-playwright`: **10 passed**. An earlier
  concurrent run shared Playwright's output directory and suffered two
  `ENOENT` trace-cleanup failures with eight tests passing; rerunning with this
  isolated output directory resolved that test-runner collision.

The implementation's fixture now clones bridge responses and returns summary
lists separately from full details, so the conversation/evidence regressions
exercise the actual IPC/data boundary that the initial fixture omitted. No
remaining blocker was found in this contributor-workflow review. The native
fixture's final refreshed production run remains part of the implementation
owner's combined verification, separate from these independent browser probes.
