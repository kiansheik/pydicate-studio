# Shared server runtime

This directory contains the Node services formerly hosted under `electron/` that
remain necessary for the collaborative server. No Electron APIs or native GUI
entrypoints are required. The authenticated HTTP adapter in `server/studio.cjs`
exposes a bounded method allowlist; adding an internal method does not expose it
to browsers automatically.

- `python-worker.cjs`: bounded UTF-8 JSONL requests, IDs, deadlines and worker
  failures; the selected corpus/engine stays in its own workspace.
- `next-service.cjs`, `validation.cjs`, `pending-context.cjs`: corpus, authoring,
  session, evidence and source context with guarded publication.
- `analysis-service.cjs`, `analysis-store.cjs`, `agent-runner.cjs`, provider modules:
  one durable owner, immutable inputs, scratch candidates, cancellation, steering
  and checked grammar repair. Server identity/capabilities authorize access.
- `scratch-service.cjs`, `shared-authoring.cjs`, `authoring/`: the same TypeScript
  transforms used by the browser. `npm run build` precompiles a Node bundle;
  source compilation remains available for development.
- `studio-mcp-gateway.cjs`, `studio-mcp-stdio.cjs`: private attempt-scoped Unix
  socket transport for runtime-issued authoring tools. The desktop-owner CLI
  launcher is removed; no unauthenticated HTTP replacement is introduced.
- `evidence-service.cjs`, `evidence-images.cjs`: managed PDFs, optimistic regions,
  safe original-byte streaming and real checked crop pixels.
- `dictionary-site.cjs`, `dictionary/`, lexical/interpretation services: exact
  dataset identities, static dictionary assets and saved notes.
- `draft-store.cjs`: serialized compatible storage used by shared analysis and
  legacy import adapters. PostgreSQL is authoritative for hosted user drafts.

`npm run test:runtime` retains shared service regressions; `test:collab` covers
HTTP/identity/PostgreSQL boundaries. Existing saved paths/schemas are unchanged.
Native main/preload, project watchers/pickers, installer/updater and desktop-only
telemetry are removed. Use [local setup](../docs/local-setup.md) to run the server.
