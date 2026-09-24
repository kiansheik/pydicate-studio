# Installers, managed workspace and updates — 2026-09-24

## Goal

Make Studio distributable to contributors without installed Python/Git or
manually cloned sibling repositories. Prepare native installers, first-run
downloads and startup updates from public main while preserving local work.

## Files inspected

Required agent guides; README/dependency baseline; main/preload/worker and
next-service; parser-lab resource paths; shared-authoring runtime compiler;
provider subprocess context; Python adapter/authoring services; App/useStudio
and bridge types; pinned builder/updater/dugite runtime source; GitHub repository
metadata and release/signing configuration; clean remote engine/corpus paths.

## Files changed

- `package.json`, lock, `.gitignore`: pinned builder/updater/dugite/tar, native build scripts and staging ignores.
- `electron/runtime-environment.cjs`, `scripts/prepare-runtime.mjs`, `requirements-runtime.txt`: standalone Python archive hashes, Git staging, isolated packaged environment, runtime smoke.
- `electron/managed-projects.cjs`: ownership/lock/staging, shallow blob-filtered sparse clones, clean-main-only fast-forward updates, interruption/offline preservation.
- `electron/update-service.cjs`: finite update check/download/install before editing; no delayed install after fallback; persisted failed-install loop protection.
- `electron-builder.config.cjs`, `.github/workflows/release.yml`, `scripts/prepare-icon.mjs`: four native targets, existing Studio icon, release checksums and complete release publication.
- `electron/main.cjs`, `preload.cjs`, `next-service.cjs`: runtime setup, startup gate, managed setup/status and fixed release-page IPC, first-launch/restoration behavior.
- `electron/shared-authoring.cjs`, `scripts/build-desktop.mjs`: packaged precompiled transforms without esbuild; dev continues using current TypeScript.
- `src/App.tsx`, `useStudio.ts`, `domain/types.ts`, `workbench.css`: startup screen, default-workspace action, progress/retry and update status; existing folder selection remains.
- `electron/tests/{runtime-environment,managed-projects,installation-session,update-service,release-config}.test.cjs`, `tests/installation.spec.ts`, `scripts/smoke-packaged.mjs`: runtime, update/data preservation and real packaged-app verification.
- README, Electron README, `docs/installing.md` and agent guides/log/handoff.

Existing uncommitted corpus-authoring/tree/morpheme work was preserved. No
neighboring repository sources, references or Git indices were changed.

## Commands run and results

- Pinned npm dependency installation: zero audited vulnerabilities.
- `npm run runtime:prepare`: verified CPython 3.13.15 archive; bundled Git 2.53.0;
  native ARM64 Mac smoke passes with empty host PATH, including Python children,
  SQLite, SSL and Git.
- Disposable public-main managed setup: corpus
  `f520ffceb62b0806718e5ca0eb8d7dbae3c8f9f2`, engine
  `eef5d62fb4b9feb443395211c064b8edeb73c5e2`. Both clean; corpus 4.6 MB,
  engine 43 MB instead of the multi-gigabyte scan tree. Dictionary status available.
- Bundled isolated Python opens 103 fresh-main passages and realizes
  `oemitymbûerypy` and `moropotara`, including morphology evidence. Existing local
  dirty-engine core also works; these are distinct compatibility checks.
- `npm test`: 232 domain tests pass.
- Targeted new desktop suites: runtime 7, managed 14, installation/session 5,
  updater 9 and release configuration/aggregation 5. Additional project-watch
  and usage regression suites pass.
- `npx playwright test tests/installation.spec.ts tests/authoring-sync.spec.ts`:
  17 existing draft/race tests pass; two new setup tests pass after correcting
  their simulated provider response and rerunning the setup file.
- `npm run typecheck`, `npm run build:app`, scoped/full code formatting and
  `git diff --check` pass. Build retains the preexisting Vite large-chunk warning.
- `npx electron-builder --config electron-builder.config.cjs --mac --arm64 --publish never`:
  actual `.app`, DMG, ZIP and updater metadata produced locally. First artifact
  was rebuilt after icon/signing/startup fixes.
- `node scripts/smoke-packaged.mjs '<app>/Contents/MacOS/Pydicate Studio' '<disposable-main-parent>'`:
  actual packaged executable, temporary `--user-data-dir`/sessionData, bundled
  Python/Git with empty host PATH, first-run UI and precompiled operations with
  esbuild forbidden; real IPC engine result `oemitymbûerypy` verified. No setup
  click or real Documents/profile mutation. CI runs startup-only probes natively.

## What worked

The installed app does not require npm, host Python/Git, sibling clones or a
runtime TypeScript compiler. Managed downloads retry safely and do not adopt
unrelated folders. Updates preserve edits, local commits and other branches.
Fresh public main supports core reading/evaluation despite the older docs'
historical dirty-baseline requirement. Automatic app updates use built GitHub
Releases rather than modifying a running installed application with Git.

## What failed or remains unverified

Sandbox DNS/server-binding restrictions required approved network/native test
execution. A test fixture initially returned the wrong provider schema; fixing
the fixture resolved the two browser failures. The initial packaged-smoke helper
used an unavailable main-process `require`; `process.getBuiltinModule` fixed the
probe. Neither was a product runtime failure.

Public releases and GitHub signing secrets were absent. Nothing has been
committed, pushed or published. Native Windows, Linux and Intel Mac builds and
installation checks await GitHub CI. Mac artifacts are ad-hoc-signed previews,
not Developer ID/notarized releases; Gatekeeper and manual app updates remain.
There is no live end-to-end upgrade between two published signed versions yet.

PDF scan archives are excluded from initial setup; users link their own PDFs.
AI credentials/accounts and optional provider CLIs remain separate. Prior
linguistic feature coverage/ground-truth discrepancies were not reapproved here.

## Remaining questions / suggested next prompt

Authorize publishing the reviewed Studio changes to main, run and inspect the
four-target release workflow, fix any native runner-specific failure, and provide
the actual download page only after assets exist. Supply Apple Developer ID and
notarization secrets for seamless Mac installation/updating. Test a real upgrade
after a second release, preserving a modified managed corpus and saved drafts.
