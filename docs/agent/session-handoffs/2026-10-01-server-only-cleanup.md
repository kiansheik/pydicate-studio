# Server-only cleanup — local verification and draft review

## Goal and branch

Retire Electron as a product, retaining the collaborative server/browser editor
and shared Python, AI, MCP, PDF, dictionary and compatible storage services.
Branch `refactor/server-only` starts at PR #16's `4d0a60c` and targets
`unlocked-light-deploy`. PR #16 must land first; the cleanup carries PR #17's
applicable server/browser fixes, so its server portion is superseded. PR #17
and the original checkout remain unchanged.

## Scope and audit

Shared services, authoring bundle and 62 detected file renames move from
`electron/` to `runtime/`. Native entrypoints, preload, updater, installer,
packaging/runtime preparation, desktop launch tests and dead dependencies are
removed. Build/CI/Docker/Make and setup/auth/contributor/agent guidance use the
server layout. Browser startup restores the hosted session; unsupported native
installer/activity controls are removed. Team reports remain hosted.

Historical handoffs/reviews/research, static learning library, persisted paths,
PostgreSQL schema and archive readers are retained. Routine deployment does not
scan local profiles. `COLLAB_IMPORT_LEGACY_DESKTOP=1` explicitly enables old
research import; old Chromium buffers require `LOCAL_BROWSER_STORAGE` pointing
to an existing allowlisted JSON export. Missing/corrupt inputs fail before upload.
Migration/default-deploy tests cover these boundaries. Deployment later requires
a full image rebuild, under separate authorization.

Bridge-pressure fixtures use browser Headers/performance APIs. Browser fixtures
retain startup/source/navigation/selection assertions and structured conflict
codes. Source creation's delayed old-engine evaluation is deliberately rejected;
all other failed HTTP requests remain fatal. The authored text, submission,
PDF rendering and source identity are checked through the real hosted editor.

## Validation

- Fresh root/server `npm ci`, format/typecheck/build: pass.
- `npm run check`: pass. Vitest 288; shared runtime 271 pass/3 skip;
  Python 442 run/240 conditional skips; deployment ops 96 pass;
  collaboration subsequently 117 pass/9 conditional skips after the new
  structured-error regression.
- Focused publication browser regressions: 11 pass.
- Selected real corpus runtime dictionary/MCP/translation checks: 11 pass.
- Docker server image builds; disposable network-disabled Linux runtime checks:
  16 pass, 1 optional corpus skip. No service/ports/data mounts were installed.
- Final full browser: 293 pass, 105 intentional/optional skips, zero failures.
- All six enabled hosted gates: 6 pass, zero skips/failures (real browser
  transport, adapter, compiled editor, source/PDF, grammar reload, reference
  publication). Conflict/session fixtures assert structured codes rather than
  the retired native message prefix; draft versions and retained edits stay checked.

Logs are in `/tmp/server-only-*.log` in the task environment. The local fixture
corpus remains at `0947248862d9b5505a99a4375ab16c8b8254eb06`; selected engine
`f901e24d83511f8c53ebcc6d292d1012df24a2f3` retains only its three preexisting
edits. Original Studio and PR #17 checkouts remain clean.

## Limits

Optional full corpus-enabled Python tests from the preceding PR #17 investigation
reported 11 assertion failures and 6 errors; two failures reproduced on untouched
Python. That supplemental suite was not rerun here; selected real adapter/runtime
checks are enabled. `docs:build` completes (5 lessons, 25 guides, 158 references),
but `docs:check` finds the historical static library differs from today's selected
engine. The generated diff was discarded to preserve checked-in research evidence.
No paid-provider generation, live operations, merge or deployment was performed.

## Suggested next step

Review the focused draft against PR #16, inspect exact-head CI, and resolve any
remaining checks before merging. Approve deployment separately; use a full rebuild.
