# URL navigation — 2026-09-30

## Goal

Retain and share the current Studio location across refresh/login, and support
browser Back/Forward without document reloads or losing local edits.

## Files inspected

App/useStudio, WorkspaceLayout, ExpressionCanvas/RuntimeTree/TreeWorkspace,
PassageLexicon, DictionaryTab, LearningWorkspace, shared-definition identity,
hosted HTTP/auth/identity/panel, dictionary adapter/site, existing browser
harnesses, light deployment script and current live dictionary JavaScript.

## Files changed

- `src/domain/studio-location.ts`, its unit tests, `src/useStudioLocation.ts`:
  bounded navigation-only query contract, alias resolution, staged history.
- `src/App.tsx`, `src/useStudio.ts`: startup gate, read-only passage restoration,
  controlled view/location state, copy-link feedback, normal browser shortcuts.
- `src/components/{PassageLexicon,DictionaryTab,TreeWorkspace,ExpressionCanvas,RuntimeTree,LearningWorkspace}.tsx`
  and `src/domain/shared-definition.ts`: controlled child navigation, exact
  declaration/dataset identities, delayed node selection and draft preservation.
- `electron/dictionary/{bridge.js,transform.cjs}`: validated exact entry reveal,
  parent-owned search history; no dictionary source repository modifications.
- Hosted `http.cjs`, `identity.cjs`, new `return-to.cjs`, auth/SSO/panel scripts:
  safe login destinations; flow-bound destination cookie, no database migration.
- Focused domain, browser, dictionary adapter/site, HTTP, auth and identity tests;
  current-state/repo-map/log and this handoff.

## Commands run and results

- `npm run typecheck`: passed.
- `npx vite build`: passed; existing large-chunk warning only. No generated
  corpus/learning files rebuilt or changed.
- `npx vitest run src/domain/studio-location.test.ts`: 5 passed.
- `npx playwright test tests/navigation-url.spec.ts tests/passage-navigation.spec.ts
  --config=.local/shared-tabs.playwright.config.ts --workers=1 --reporter=line`:
  14/14 passed (21.3 seconds), including 10 actual App cases for direct links,
  reload, history without document reload, unsaved drafts, delayed source nodes,
  alias canonicalization, malformed targets, filters/catalog and shared tabs.
- Child lexical/dictionary browser suites: 24 passing cases; adapter/site Node
  tests: 11 passing cases.
- Shared-tree navigation: 3 standalone cases and 2 existing tab regressions pass.
- Hosted authentication: 16 focused cases pass with fresh disposable PostgreSQL,
  real Chrome password login and real local Neo consent/callback. The existing
  two-browser expired-session recovery case also passes after panel changes.
- Current live dictionary `js/index.js` copied read-only into ignored private QA
  storage; the new exact-marker adapter accepts it.
- Authenticated predeploy `corpus_health`: 154 lines, zero divergences/failures,
  seven pending, 321 morphemes, no active repairs (2.777 seconds).

## What worked

Explicit URLs override latest startup only after saved drafts are available.
Back/Forward keeps a mounted document and even a deliberately unacknowledged
note edit. Pending-to-published UUID aliases replace the current entry. Invalid
links do not create new passages and a deliberate navigation adds one entry.
Search typing does not create one history entry per character. Dictionary
restoration never mounts the automatic import component. Shared tabs retain
separate dirty drafts, validate exact target identity and ignore late focus.
Password and actual local Neo browser round trips return to the requested query.

## What failed and was fixed

The first direct-node test found that node selection ran before parsing and
never retried. It now waits for the graph once per requested identity, preserving
later manual canvas choices. Review caught filter=all/leading-zero dictionary
normalization stalls and an extra fallback history entry when leaving an invalid
link; both are fixed. Test-only duplicate button/status and late iframe locators
were corrected. Vitest requires domain tests under src, not tests/.

## Remaining questions / boundaries

Links identify current project objects, not immutable historical revisions.
Deleted passages, stale declarations and changed dictionary datasets remain
explicit unavailable links. Desktop file-URL serialization is checked locally;
packaged desktop browser-history behavior was not manually exercised. Sharing
a link does not grant project access. No AI generation, grammar/corpus edit,
publication, reorder or editorial approval is part of this change.

## Suggested next prompt

Check a shared passage/lexical/tree link from another contributor's actual account
and report any missing navigation state, keeping links read-only on open.

## Deployment and live verification

Committed/pushed release `335de372a78c57d48f3a0623aff482fdb3c5e670` to existing
`unlocked-light-deploy`; ran `STUDIO_REF=unlocked-light-deploy make collab-deploy-light`.
The six rollout checks passed. The real rollout took 52.9 seconds; PostgreSQL
stayed running. Backup: `20260930T233134-5a2242`. No migrations or research imports.

Private before/after parity: exactly 145 research files and six evidence/PDF
files unchanged. Authenticated fresh corpus health: 154 lines, zero divergences
or execution failures, seven pending, 321 morphemes, no active repairs, 2.708s.

Actual production Chromium started at an earlier passage link while logged out,
returned through password login to its lexical view, navigated tree/projection
Back/Forward without replacing the document, reloaded the same passage/projection,
then searched the real dictionary and reloaded that exact search. The copy-link
control is visible. No page errors and no attempted research mutations (all
research writes blocked by the QA route guard). Screenshot and scripts remain in
ignored `.local/vps-qa/navigation-*`; no credentials are committed or printed.

The QA checks themselves passed before its final cleanup helper incorrectly
accessed `.error` on the valid null session_select acknowledgement. The selection
restore returned HTTP 200. Fixed the private helper's null handling/cleanup and
closed its owned QA process; no production product defect was involved.
