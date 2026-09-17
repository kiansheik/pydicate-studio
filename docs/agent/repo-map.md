# Repository map

- `src/App.tsx`: passage navigation, workspace modes/projections, reference comparison, project modal, export and provenance UI.
- `src/components/SourcePane.tsx`: independent reading fields and session image/PDF consultation.
- `src/components/PhraseEditor.tsx`: supported phrase cards, explicit controls, shared constituent selection.
- `src/useStudio.ts`: draft loading/saves, per-passage undo, project transitions, fresh render results and orphan retention. Hook regressions use `tests/hook-harness.*`.
- `src/domain/types.ts`: shared project/draft/analysis/render/bridge contracts.
- `src/domain/model.ts`: strict draft validation, exact expression serialization, comparison policy and browser persistence.
- `src/domain/example.ts`, `example-passages.json`, `render-snapshots.json`: real corpus excerpts and evaluated engine examples; [attribution](../../src/domain/fixtures-attribution.md).
- `src/styles.css`, `src/fonts.css`, `public/mark.svg`: offline UI styling, system font fallbacks and original mark.
- `electron/main.cjs`, `preload.cjs`: desktop lifecycle, custom application origin/CSP and narrow IPC bridge. [Desktop contract](../../electron/README.md).
- `electron/validation.cjs`, `draft-store.cjs`, `python-worker.cjs`: boundary validation, atomic persistence, bounded JSONL worker lifecycle; focused Node tests in `electron/tests/`.
- `python/adapter.py`, `worker.py`, `engine_render.py`: read-only AST/corpus adapter, Studio UUID sidecar, fingerprinting and fresh engine rendering. [Python contract](../../python/README.md).
- `python/snapshot.py`: explicit regeneration of example evaluation/compatibility artifacts. Do not casually regenerate fixtures or upstream corpus artifacts.
- `python/tests/`, `src/domain/*.test.ts`, `tests/*.spec.ts`: adapter, model and browser regressions.
- `scripts/dev.mjs`, `start.mjs`, `smoke-desktop.mjs`: desktop development, compiled launch and isolated native smoke. Strip inherited `ELECTRON_RUN_AS_NODE` before launching Electron.
- `package.json`, `package-lock.json`, Vite/TypeScript/Playwright/Prettier configs, `Makefile`, `.github/workflows/check.yml`: reproducible Node tooling and local/CI checks.
- `docs/design/`: supplied product brief, measured operation coverage, implementation scope and observed compatibility evidence.
- `docs/agent/`: concise project state, open questions, log and handoffs.

Language semantics belong to Python/Pydicate. The TypeScript serializer covers only the explicitly typed construction; it does not realize Tupi morphology. Unknown expressions and source bytes remain unchanged.
