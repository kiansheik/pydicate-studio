# Contributor feedback, usage review and compact workspace

## Goal

Review Kian/Lauro/Emerson usage and the supplied conversation; fix basic-mode pane
closing and cramped passage navigation; improve operator/variant discoverability.
The attached Claude/deployment investigation supplied context, not a request to
resume its unrelated unfinished runtime or deploy changes.

## Files inspected

- Required `docs/agent/{index,current-state,repo-map,open-questions}.md` and pasted attachment.
- WorkspaceLayout, workspace domain/CSS, styles/authoring/workbench CSS, App,
  preferences, ExpressionCanvas, TreeScopeEditor, GrammarDiagnosticDialog,
  operation-terms, PieceSearch, LexicalInput and usage recorder.
- Hosted http/store/research code, schema, account/help HTML, compose/deploy docs.
- authoring_service, authoring_runtime, rendered_structures and relevant tests;
  neighboring corpus lexicon read-only (no edits).
- Local usage report and read-only production aggregate SQL, no raw research text.

## Files changed

- `src/components/WorkspaceLayout.tsx`, `src/workspace.css`: basic-mode reachability,
  compact pane navigation, scrollable readable passage list and viewport sizing.
- `src/components/ExpressionCanvas.tsx`, `TreeScopeEditor.tsx`: named operator entry
  points, reveal/focus and existing-operation controls before adding operations.
- `GrammarDiagnosticDialog.tsx`, `src/domain/operation-terms.ts`: contextual help.
- `src/App.tsx`, `src/domain/preferences.ts`: remove overconfident usage comments.
- `server/public/account.html`: distinguish Neo access from local password minimum.
- `server/research.cjs`, `server/tests/usage-details.test.cjs`: allowlisted navigation
  destinations/search outcomes; reject unknown labels, user text and invalid counts.
- `tests/streamlined-desk.spec.ts`, `tests/canvas.spec.ts`: regression coverage.
- `docs/research/2026-09-29-contributor-feedback.md`: findings, counts, limitations,
  unresolved feedback and reproduction query; current-state/log/repo-map/this handoff.

## Commands run and results

- `rg`, targeted reads, `git status`, `git diff --check` (clean).
- `node scripts/usage-report.cjs --days 7`: 7,112 local events / 11 sessions.
- SSH read-only Docker listing and `psql` aggregate SELECTs enclosed in
  `BEGIN READ ONLY` / `COMMIT`. Names/counts only; no export, mutation or restart.
- Disposable local ProjectAdapter `structure_search`: both `'u` and `’u` return
  reference `u` / surface `'u` first; separate lexical search also succeeds.
- `npm run typecheck`: passed.
- `npm exec vite build`: passed; existing >500 kB chunk-size warning. Full `npm run
  build` deliberately not used because its first step rewrites generated learning
  data; no checked-in generated files were changed.
- `node --test server/tests/usage-details.test.cjs`: 2 passed; no database needed.
- Final focused Playwright run across workspace, streamlined-desk, grammar-repair,
  tree-scope-preview and the new canvas operator regression: 17 passed (28.4 s).
  Four size cases include screenshots. Earlier repeats are not counted again.
- Targeted Prettier check: passed. Screenshots visually inspected at 640×480 and
  1280×720; automated geometry/click checks also cover 800×600 and 1024×768.
  Future runs save captures in each Playwright test's output directory.

## What worked

Basic mode cannot close panes; saved advanced hidden/docking preferences remain
recoverable when advanced mode returns. Pane switching, scroll/click targets and
advanced docking/mount preservation passed. Existing operator replacement changes
`tym / ypy` to the parsed `*` operator without creating loose fragments. Preview,
repair submission/retry and meaning-preservation tests remain passing.

Hosted search/add/combine events support keeping reuse and editing accessible.
The sanitizer gap is fixed prospectively: historical discarded fields are gone.
Details and the actual observed counts are in the linked feedback review.

## What failed

Initial SSH DNS and local Vite binding were blocked by the sandbox; rerunning
those bounded operations with reviewed escalation succeeded. The first new canvas
assertion expected unparenthesized text, while the existing exact-span editor
produced `((tym) * (ypy))`; fixed the test to inspect the parsed operator.
No production mutation or AI generation occurred.

## Remaining questions

Hosted apostrophe lookup was not reproduced locally. Exact reported terminal
representations, linguistic output changes, AI provenance/tool receipts and Neo
profile password controls remain unverified. Variant authoring still requires
an explicit grammar-correction request; this pass clarifies it but does not build
a new variant-definition UI. No contributor device acceptance, full server DB
suite, deployment, commit or push. Pasted provider/deploy work remains separate.

## Suggested next prompt

Review these local UX changes, then reproduce Emerson's apostrophe lookup in the
hosted passage context and inspect the original variant job receipts. Design a
single variant-request form from that evidence, preserving shared-rule scope,
source/hypothesis status and explicit submission.
