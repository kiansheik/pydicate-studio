# Multiple sources, contributor PDFs and deployment transfer

## Goal

Repair the hosted unsupported queue error; include local attached PDFs when
updating with Make; let contributors select/create sources, upload their own
PDFs, start whole `.tu.py` files and add first/existing-source passages for a demo.

## Files inspected

- Required agent index/current state/repo map/open questions and existing hosted
  contract, deployment and contributor guides.
- App/useStudio/source/analysis/PDF panels, bridge types and pending projection;
  browser harnesses and PDF/next-passage tests.
- Python adapter/concrete authoring/runtime/insertion, desktop worker/service/
  validation/evidence store; real corpus and engine read-only fixtures.
- Hosted studio/HTTP/bridge/submissions/store and tests; collab ops/host/importer,
  Makefile, Compose wiring and existing operation tests.

## Files changed

- `src/App.tsx`, `useStudio.ts`, `workbench.css`, new `components/NewSourceDialog.tsx`
  and `domain/sources.ts`; `domain/{types,next-page}.ts` and tests.
- `components/{AnalysisSupport,SourcePane,PdfEvidence,LessonQuestion,NewPassageDialog}.tsx`,
  new `domain/capabilities.ts`; focused source/analysis/PDF browser tests/harnesses.
- `python/{source_catalog,adapter,authoring_service,passage_insertion}.py` and
  adapter/authoring/pending tests; `electron/{analysis-service,next-service,
  python-worker,validation}.cjs` and worker contract test.
- `server/{studio,http,submissions}.cjs`, `public/bridge.js`, source/submission
  integration tests and new compiled browser workflow; collaboration CI entry.
- `scripts/collab/{evidence_sync,ops,host,import_submissions}.py`, three operation
  test modules, Makefile and deployment README.
- Contributor/browser guides and this handoff/current state/repo map/log.

## Behavior and provenance

Catalog includes readable historic `.tu.py` sources except the shared lexicon.
New source IDs are bounded lowercase Python identifiers excluding reserved
names/keywords; exclusive creation cannot overwrite existing files. Bibliographic
title/year live in a `# studio-source:v1` JSON header. Scaffold imports the normal
lexicon and contains an empty list; it creates no passage or reference. Pending
first lines live in drafts until reviewed source publication. Existing-source
append uses the actual collection variable; equal-syntax append preserves prior
identities. Source creation updates both desktop and hosted project state.

Hosted contributors attach a first PDF and edit their passage evidence. Reserved
publication UUIDs resolve to pending IDs for validation/claims, and upload carries
the manifest revision for concurrency checks. Only reviewers replace an existing
witness or publish/approve. The editor exposes **Enviar para revisão** and hides
unsupported direct publication controls for contributors. Submission freezes
source metadata and own saved PDF regions/view/pointer; imported source comments
preserve the pointer. PDF bytes remain in managed evidence/backup archives, not
in Git or the submission JSON. Paid AI remains disabled hosted.

Make deployment snapshots attached/retained managed PDFs for the desktop's last
opened project, with optional profile/workspace overrides. It does not crawl
unrelated PDF directories or transfer unpublished local source files. Checksummed
archives are imported with the app stopped after backup/migration. Existing
hosted PDF selections and regions win; ambiguous/unmatched entries are retained
for review in the archive/report, never silently assigned by ordinal alone.

## Commands run and results

- `npm run typecheck`; `npx vite build`: passed (existing bundle-size advisory).
  No `docs:build` or checked-in generated corpus/doc regeneration.
- Scoped Prettier checks and `git diff --check`: passed.
- `npx vitest run src/domain/next-page.test.ts src/domain/model.test.ts`: 26 passed.
- Playwright source workflow: 3 passed, including only-empty-source startup;
  existing next-passage workflow: 8 passed; focused analysis queue/generic-source/
  batch/restart checks: 5 passed; complete actual-PDF suite: 9 passed.
- Python adapter + pending suites: 35 passed, plus 5 focused source/reference
  tests (40 total). Actual source no-op roundtrip
  inspected all 122 rows while preserving bytes; focused authoring regressions
  also exercised source/reference/multilingual insertion.
- Desktop worker/evidence/pending services and analysis checks: 40 passed,
  including first-passage analysis on a non-Araújo source. Hosted core/source/
  submission/HTTP focused checks: 20 passed, with disposable PostgreSQL.
- `python3 -B -m unittest discover -s scripts/collab/tests -v`: 26 passed.
- `COLLAB_FULL_EDITOR=1 COLLAB_REAL_PROJECT=/Users/kian/code ... node --test
  server/tests/full-editor.test.cjs server/tests/source-workflow.test.cjs`:
  original compiled editor passed; final source-workflow rerun passed separately
  after fixing the pre-existing `ui.tools` telemetry allowlist mismatch. It uses
  real Chrome, isolated HTTP/PostgreSQL, disposable corpus writes and actual
  Python evaluation (`Noun("abá", definition="pessoa")` → `abá`). Creation,
  upload, own crop, save/reload, first-reading submission with evidence and
  absence of contributor publication/automatic ground truth are verified.
- Actual managed Araújo PDF local export/import/service readback:
  **84,734,099 bytes**, `managedState=ok`, **100** mapped evidence entries,
  **2** unmatched retained. Desktop session/manifests/identity registry unchanged.

## What failed and was repaired

The UI loaded desktop AI queue/provider methods in hosted local-mode projects.
PDF reserved IDs initially failed hosted passage validation, and uploads dropped
`expectedRevision` at both transport hops, causing generic 500/stale errors.
New-source review exposed equal-syntax append identity loss; existing tests
assumed Araújo was the sole source. Empty-only project startup needed a first
pending shell. PDF pointer restoration and replacement required explicit fresh
status callbacks. The actual browser caught an omitted `ui.tools` telemetry
event. All listed failures were fixed and their focused checks passed.

Sandbox initially denied localhost dev-server binding and PostgreSQL shared
memory; approved isolated test commands ran outside the sandbox. One PDF mouse
test raced page geometry; its helper now waits for settled aspect ratio before
drawing. A Python run encountered stale engine fingerprints during simultaneous
code edits; the settled-file rerun passed.

## Remaining questions and boundaries

- Changes are local and uncommitted; live VPS deployment and remote Docker import
  have not been executed. Make deploy downloads the specified remote `STUDIO_REF`;
  local code must be published in that ref before the live update can use it.
- Existing neighboring corpus/engine changes were read, not modified. Verified
  checkout revisions were corpus `f520ffceb62b0806718e5ca0eb8d7dbae3c8f9f2`, engine
  `5ca1560f748cca5f64d67a208a33639fcbdf0f62`; both have existing dirty work, so
  these hashes alone do not recreate the selected test content.
- Browser PDF fixture is an original vector PDF; the large real Araújo scan was
  byte/readback-verified through evidence service, not visually rendered by this
  task. Historical scan/font accuracy remains a separate verification boundary.
- Arbitrary contributor `.tu.py` upload is not implemented: **Nova fonte** creates
  a safe empty file, and the user uploads the PDF and authors passages in Studio.
- Existing uncommitted Neo/VPS handoffs and agent-note updates were preserved.
- The disposable PostgreSQL instance at port 56543 was stopped after the final
  compiled contributor workflow passed. No production database was contacted.

## Suggested next prompt

Review and publish these source/PDF changes, then deploy that exact Studio ref
with `make collab-deploy`, inspect the retained evidence reconciliation report,
and verify the demo with a normal invited contributor account and its own PDF.
