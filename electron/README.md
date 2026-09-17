# Desktop boundary

`main.cjs` owns native file selection, the active project, Python workers, file watching and the application lifecycle. The sandboxed/context-isolated renderer uses the preload bridge; every IPC request verifies its sender. The generic `invoke` route exposes an explicit method allowlist in `next-service.cjs` and `python-worker.cjs`, plus validated evidence/provider services. It does not expose arbitrary filesystem or shell access.

Production assets use `studio://app`. CSP permits packaged scripts, local assets and the packaged PDF.js worker; it excludes remote scripts and evaluated strings. New windows, remote navigation and device permission requests are denied. PDF managed copies are returned by the main evidence service; renderer blob URLs are presentation objects, not persistence.

## Services

- `python-worker.cjs`: bounded JSONL requests with IDs, UTF-8 framing, size limits, failure propagation and a 60-second timeout. A fresh worker is created on project open. `PYDICATE_PYTHON` selects the executable; no shell command string is evaluated. The trusted selected engine remains normal Python, not an untrusted-repository sandbox.
- `next-service.cjs`: project/session restoration, explicit corpus operations, durable evidence and provider integration. Provider context derives actual active repository paths in main; it does not trust renderer-supplied paths.
- `draft-store.cjs`: schema-versioned atomic, serialized draft persistence under Electron userData. Invalid existing files remain intact. Pending reading-only passages use the same store and reserve eventual passage IDs. Drafts contain no approval field.
- `project-watch.cjs`: external source notifications; successful Studio writes reset the watch and suppress their own events. Closing a watch cancels pending callbacks. Authoritative source/dependency checks still occur before apply/evaluate.
- `evidence-service.cjs`: managed fingerprinted PDFs, relocation/replacement checks, optimistic revisions and persistent page-point regions. See [evidence schema](../docs/design/pdf-evidence.md).
- `provider-service.cjs` and provider modules: Codex App Server and Claude Messages streams, cancellation, exact revision provenance and immutable original responses. Credentials remain in main/environment. See [provider contract](../docs/design/providers.md).

Source preview/apply, lexical edits, verification, reference acceptance and recovery are delegated to the [Python service](../python/README.md). The native picker is used only for selected project/PDF paths. Source write-back is explicit; normal draft autosave does not mutate historical files.

## Run and test

`npm run desktop` starts Vite and Electron. `npm run build && npm start` opens the compiled desktop. Launch scripts remove an inherited `ELECTRON_RUN_AS_NODE`. The last project/passage and dark/light preference are persistent.

`npm run test:desktop` runs service and boundary tests without a GUI. After building, `npm run test:smoke` launches production Electron with temporary application data and disposable copies of the actual corpus. It exercises real native authoring, dictionary, PDF and save/restart workflows; picker replacement is confined to the test process. Historical corpus source and records are hash-checked unchanged. Browser race tests deliberately simulate delayed responses; authenticated provider checks remain separate.

There is no installer or bundled Python runtime. A future package must include `dist`, Electron modules, Python service resources, and a verified dependency set. The current developer workspace is reproduced through [recorded dependency instructions](../docs/design/dependencies.md).
