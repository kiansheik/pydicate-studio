# Desktop boundary

`main.cjs` owns the native project picker, Python process and draft files. The
sandboxed renderer receives only the five named operations in `preload.cjs`;
every IPC call checks its sender and argument shape. Production assets are
served from `dist/` on the local `studio://app` origin. New windows, external
navigation and permission requests are denied. Production responses include a
Content Security Policy permitting local application assets and selected blob
images/PDFs; remote scripts and evaluated script strings are disallowed.

`python-worker.cjs` exchanges newline-delimited JSON with `python/worker.py`.
Requests are limited to `open_project`, `refresh_project` and `render`. Responses
retain request IDs; a process failure or 60-second timeout rejects all pending
requests. Reopening a project starts a new worker. The application invokes
`python3 -B` by default; set `PYDICATE_PYTHON` to a Python executable path when
using a prepared virtual environment. No shell command string is evaluated.

`draft-store.cjs` keeps schema-versioned drafts below Electron's `userData`
directory, using a SHA-256 project key as the filename. Saves are serialized per
project, flushed to a temporary file and renamed atomically. Invalid existing
files produce an error with their recovery path and cannot be overwritten by
autosave. A single application instance owns each user-data directory, avoiding
competing desktop writers. Drafts have no accepted-reference or approval fields.

Run `npm run desktop` for Vite plus Electron, or `npm run build && npm start`
for the compiled application. Run `npm run test:desktop` for persistence,
validation and worker lifecycle tests; these tests do not launch a GUI.
Launch scripts clear an inherited `ELECTRON_RUN_AS_NODE` switch so terminals
hosted inside an Electron application can launch the native Studio correctly.

After building, `node scripts/smoke-desktop.mjs` launches the compiled desktop
with temporary application data and checks renderer isolation, the production
policy, a local scan image and draft save/reopen. An optional parent folder argument also checks native project
opening and live Python realization. The folder dialog is replaced only inside
the test process; existing application data and corpus sources remain untouched.

There is no packaged contributor runtime yet. A future installer must include
`dist/`, `electron/` and the package metadata, copy `python/` to
`resources/python/`, and supply a tested Python runtime and dependency set.
Installing the desktop shell alone does not establish a compatible corpus and
engine snapshot.
