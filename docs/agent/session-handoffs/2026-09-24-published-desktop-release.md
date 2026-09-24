# Cross-platform public preview — 2026-09-24

## Goal

Publish the authorized Studio changes and downloadable installers for Windows,
Linux, Apple Silicon Mac and Intel Mac, with Python/Git included and automatic
public-main workspace preparation. Preserve neighboring source repositories.

## Files inspected

Required agent guides; release/check workflows; builder/runtime/update/managed
project configuration; packaged-app probes; native CI logs; Python child process,
publication and atomic write paths; MCP transport; canvas newline fixtures;
portable browser checks. This follows the
[implementation handoff](2026-09-24-installers-managed-updates.md).

## Files changed

- `.github/workflows/release.yml`: native UTF-8 environment, actual managed
  setup and packaged-engine probes on every target, absent signing-secret handling.
- `python/adapter.py`, `authoring_service.py`: explicit isolated-child UTF-8
  mode and UTF-8 subprocess decoding; `test_runtime_encoding.py` covers actual
  children with conflicting host encoding settings.
- `python/reviewed_files.py`, `publication_regression.py`, `authoring_runtime.py`:
  portable atomic file permissions/durability and disposable source validation
  with the original trusted engine path instead of privileged Windows symlinks.
  Seven publication portability tests cover the new boundaries.
- `electron/studio-mcp-gateway.cjs`: Windows named-pipe transport, retaining
  authenticated per-attempt ownership and Unix socket permissions elsewhere.
- `electron/draft-store.cjs`, `analysis-store.cjs`: retain file flushing and
  atomic rename on Windows, and directory flushing on POSIX; native storage tests
  cover Unicode persistence and damaged-state preservation.
- `src/useStudio.ts`, `App.tsx`: existing-project opening reports success before
  closing the picker, preserving visible errors and retry after cancellation.
- `scripts/smoke-managed-install.mjs`, `smoke-packaged.mjs`: bundled-Git HTTPS
  setup, temporary profile, actual packaged executable and real engine evaluation
  with host Python/Git absent from PATH.
- Runtime/managed-project/canvas test fixtures: Windows path delimiters,
  JSON-preserved CR/CRLF source text, original-byte restoration with Git autocrlf,
  and a bounded timeout for a multi-process test on slower Intel runners.
- CI/test portability and narrow-screen header fixes are documented in the
  [portable checks handoff](2026-09-24-portable-ci-checks.md).
- Installation and agent documentation records publication and remaining limits.

## Commands run

- `git fetch origin`, ancestry/diff/status inspection, approved commits and
  fast-forward `git push origin HEAD:main`; no force push or neighboring edits.
- `gh run view`, native job-log downloads and targeted failure inspection.
- Domain/runtime/update/managed-project tests; real MCP stdio transport tests;
  isolated Python encoding and publication portability tests.
- `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true node --test electron/tests/managed-projects.test.cjs`:
  14 pass, including exact restoration after a protected dirty checkout.
- `npx playwright test tests/installation.spec.ts tests/hooks.spec.ts`: 10 pass,
  including opening failure, cancellation/retry and draft preservation.
- Native workflow: `npm ci`, domain/integration gates, `build:app`,
  `runtime:prepare`, `smoke-managed-install.mjs`, electron-builder,
  `smoke-packaged.mjs`, artifact checksum verification and GitHub publication.
- [Checks run 36066168935](https://github.com/kiansheik/pydicate-studio/actions/runs/36066168935)
  at `4abdbe7`: formatting/build, 232 domain tests, 267 desktop tests (3 skipped),
  161 Python tests (218 skipped), 178 browser tests (86 skipped) all pass.
  Skips explicitly require unavailable author-selected corpus/engine fixtures.

## What worked

Published [0.2.10006](https://github.com/kiansheik/pydicate-studio/releases/tag/v0.2.10006)
from `4abdbe74e878d96496a22e426023e497d47cbc7a` through
[release run 36066169009](https://github.com/kiansheik/pydicate-studio/actions/runs/36066169009).
Windows x64, Linux x64 and both Mac architectures pass native builds, remote-main
setup and real packaged-app checks. The fresh workspace has 103 passages and realizes
`oemitymbûerypy` through IPC. Runtime probes verify bundled Python 3.13.15,
Git 2.53.0, SQLite, SSL and precompiled authoring operations.
The public release is neither a draft nor a GitHub prerelease; all 14 assets are
uploaded. Downloaded public `latest.yml`, `latest-linux.yml` and `latest-mac.yml`
all report 0.2.10006, and the Mac manifest contains both architectures. Linux's
actual asset uses `linux-x86_64.AppImage`; the installation guide reflects that
builder-generated filename. Documentation-only publication follow-ups skip CI
to avoid generating another identical installer release.

## What failed and was corrected

Native runners exposed Windows isolated-Python encoding, privileged-symlink and
POSIX-only file API assumptions; MCP Unix-only transport; and test assumptions
about PATH delimiters, newlines and Git checkout bytes. Each received a targeted
fix and regression check. Empty signing secrets were initially interpreted as a
certificate path; the workflow now removes absent credential variables. A slow
Intel subprocess-heavy test needed a realistic deadline. Browser CI also exposed
stale fixtures and a Mac-only screenshot destination; see the checks handoff.
The first complete Windows packaging attempt exposed unsupported directory
flushing during draft persistence before opening the project. Both local stores
now retain Windows-supported durability operations, and failed opening leaves
the picker available rather than closing it and hiding the original error.

Failed/incomplete release runs never published a partial set of assets.

## Remaining questions

Developer ID/notarization and Windows signing credentials are absent. Mac preview
application updates are manual. Native packaged-app checks do not prove the full
installer wizard/DMG drag-and-drop experience on users' own computers, or a real
upgrade between published signed versions. Optional AI provider credentials and
CLIs remain separate, and historical PDFs are not included in the initial clone.

## Suggested next prompt

Supply distribution-signing credentials and test a real upgrade while preserving
a modified managed corpus, drafts and evidence; collect first-install feedback
from contributors on each supported system.
