# Pydicate Studio

A collaborative browser editor for historical Old Tupi sources and Pydicate
analyses. The Node server runs the selected Python corpus/grammar, stores shared
research in PostgreSQL, and serves the React editor. Contributors use an invited
account in their browser; they install nothing.

- [Contribute in the browser](docs/collab-contributor.md)
- [Editor and review guide](docs/contributor-guide.md)
- [Local server setup](docs/local-setup.md)
- [Authentication and AI accounts](docs/authentication.md)
- [Deploy, backup and recover](deploy/collab/README.md)
- [Agent guidance](docs/agent/index.md)

## Development

Use Node 24, Python 3.12+, Git and PostgreSQL 17. The server launcher requires
Linux and `flock` from util-linux; use a Linux container on macOS/Windows.

```sh
npm ci
npm --prefix server ci
npm run build
# Configure database, workspace and origin as described in local setup.
npm start
```

`npm run dev` serves the isolated browser example and test harnesses through Vite.
It does not start the authenticated server or provide a writable corpus.
`npm run build` checks TypeScript, builds the browser, and precompiles the shared
Node authoring transforms. The checked-in learning library is retained;
`docs:build` is a separate authoring operation against selected dependencies.

## Research workflow

Choose or create a source, attach a PDF, mark regions and enter the diplomatic
reading. Region edits save automatically. Build a tree or edit recoverable
Pydicate source; the server evaluates it with the selected engine. Draft saves
retain version checks and attributed history. Browser presence and comments
support discussion; they do not merge simultaneous tree edits automatically.

Send a saved revision for review. A reviewer inspects the actual PDF/result and
explicitly publishes the source and, where appropriate, approves the reference.
Generated surface equality never grants editorial approval. AI proposals and
checked grammar repairs require server capabilities and remain separate from
source/reference publication. Routine tests use simulated providers and make no
paid generation requests.

## Checks

```sh
npm run check
npm run test:e2e
```

`check` runs formatting, type/build, domain, shared-runtime, Python, deployment
operations and collaboration tests. Collaboration integration requires an
isolated `COLLAB_TEST_DATABASE_URL`; enabled real-browser/engine gates are
explained in [local setup](docs/local-setup.md). Missing optional fixtures are
reported as skips. Full real-corpus tests can expose fixture/engine differences;
they are not evidence of linguistic correctness.

## Server-only boundary

The Electron app, native project picker, installers, updater and bundled Python/
Git toolchains are removed. Shared code formerly under `electron/` now lives in
[`runtime/`](runtime/README.md). No database schema, state path, corpus format or
saved evidence migration is required. Existing historical import archives and
administrator history readers remain compatible. One-time old-profile migration
requires an explicit opt-in and an existing allowlisted browser-storage export;
see deployment documentation. Historical review reports and handoffs retain the
paths and results that were verified at the time.
