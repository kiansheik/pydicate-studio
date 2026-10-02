# Repository map

- `src/`, `tests/`: React browser editor, shared TypeScript domain transforms,
  simulated browser fixtures and actual PDF rendering checks. Vite's `dev` is the
  isolated example/harness, not the authenticated corpus server.
- `runtime/`: Node Python worker/protocol, corpus authoring, AI/provider/MCP,
  evidence/crops, dictionary and compatible store services. `runtime/authoring/`
  bundles the same TypeScript transforms used by the canvas. `runtime/tests/`
  retains shared service regression coverage without native GUI dependencies.
- `python/`: bounded source adapter/interpreter, authoritative corpus/engine
  bridges, dictionary/search/parser-lab helpers and disposable-copy tests.
- `server/`, `server/public/`: authenticated HTTP/SSE/browser transport, PostgreSQL
  drafts/history, roles/invites/Neo SSO, presence/comments/submissions, managed
  evidence, administrative reports and scoped AI authorization. `start.cjs` owns
  the Linux kernel-held startup lock; `index.cjs` must not be launched directly.
- `server/desktop-*.cjs`, legacy public history/storage readers,
  `scripts/collab/{desktop_sync,evidence_sync}.py`: retained migration/archive
  compatibility, not a desktop application. Do not rename persisted paths, drop
  migrations or remove orphan/conflict history merely because of their names.
- `scripts/build-runtime.mjs`: precompiled server-side authoring transforms.
  `scripts/build-learning.py` rebuilds reference material only as a separate
  authoring operation using explicitly selected dependencies.
- `scripts/collab/`, `deploy/collab/`, `Makefile`: install/full/light deployment,
  dependency sync, backup/restore, reviewed Git contribution publication and
  local tests. Normal deploy never discovers a local desktop profile; legacy
  import requires `COLLAB_IMPORT_LEGACY_DESKTOP=1` and optional prior JSON export.
- `.github/workflows/check.yml`, `collab.yml`: type/build, domain/runtime/Python/
  operations tests, full browser gate, PostgreSQL/HTTP/transport and real hosted
  editor gates. No native release workflow remains.
- `docs/local-setup.md`, `authentication.md`, `collab-contributor.md`,
  `contributor-guide.md`: supported setup and user/admin workflows.
- `docs/reviews/`, `docs/coverage/`, `docs/research/`, session handoffs, dependency
  manifests/patches: historical evidence. Keep original hashes, paths, results
  and limitations; retired desktop references there are not current run commands.

Read current state/open questions before editing. Preserve source bytes, editorial
approval boundaries and live data. No cleanup alone authorizes deployment.


Grammar correction workflow: `runtime/grammar-repair.cjs` keeps scoped targets,
checks and clerical-note guards; `runtime/analysis-service.cjs` owns attempts,
progress, observation confirmation, deadlines and cancellation. `analysis-store`
reads legacy inline state and packs large exact payloads into hash-verified files
under its records directory; preserve that directory in full on backup/export.
`server/ai.cjs` projects browser history without model replay/baseline bodies.
`AnalysisSupport`, `domain/analysis` and `grammar-diagnostic` present provisional
forms distinctly from complete validation and source approval.

Builder recipes: `src/components/BuilderGuide.tsx` exposes the in-app guide;
`src/domain/builder-guide.json` is shared recipe data. `scripts/build-builder-guide.py`
produces the portable `docs/construction-cheatsheet.md`; its `--check` and
`python/tests/test_builder_guide.py` protect alignment and executable examples.
Common operation shortcuts and mode controls remain in `ExpressionCanvas` and
use the existing `OperationPreview`/canvas scoped edit pipeline.
