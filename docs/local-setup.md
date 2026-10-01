# Local collaborative server

The supported runtime is Linux with Node 24, Python 3.12+, Git, util-linux
(`flock`) and PostgreSQL 17. macOS/Windows can run checks and the browser example;
use a Linux container/VM for the single-owner server launcher. Production image
and installation commands are in [deployment](../deploy/collab/README.md).

## Install and select a workspace

```sh
npm ci
npm --prefix server ci
npm run build
```

Set `PYDICATE_PROJECT_PARENT` to a directory containing Git clones named
`oldtupicorpus` and `nhe-enga`. Existing research clones are preserved; use separate
clones for tests. The deployment's reviewed dependency revisions are recorded in
`deploy/collab/dependencies.json`. The Python adapter reads source through bounded
AST interpretation, but selected engine Python is trusted code.

## Run on Linux

Use a dedicated local database and a private state directory. Example settings
for a disposable development installation (choose your own database credentials):

```sh
export COLLAB_DATABASE_URL='postgresql://studio:local-test-password@127.0.0.1:5432/studio_dev'
export COLLAB_STATE_DIR="$PWD/.local/server"
export PYDICATE_PROJECT_PARENT='/path/to/disposable/workspace'
export PYDICATE_PYTHON=python3
export COLLAB_PUBLIC_URL='http://127.0.0.1:8787'
export COLLAB_ALLOW_HTTP=1
export COLLAB_HOST=127.0.0.1
export COLLAB_PORT=8787
export COLLAB_AI_ENABLED=0
npm run collab:admin -- bootstrap --email you@example.org --name 'Local reviewer'
npm start
```

The admin command requests its password through the terminal. Visit the configured
origin and sign in. `npm start` and `npm run collab` use the same kernel-held owner
lock. Do not launch `server/index.cjs` directly or bypass the lock. Database
migrations run when the store opens; the server refuses unresolved legacy SQLite
rather than silently adopting it. No desktop installation or updater is involved.

Public hosting requires HTTPS, SMTP, protected secrets and the documented reverse
proxy/network configuration. See [authentication](authentication.md).

## Validate without live data

```sh
npm run check
npm run test:e2e -- --workers=4
```

Set `COLLAB_TEST_DATABASE_URL` to a dedicated PostgreSQL database to enable storage,
HTTP and collaboration checks. Each test uses isolated schemas; never point this
variable at production. Python tests use disposable corpus copies when
`PYDICATE_PROJECT_PARENT` is available; otherwise optional corpus cases skip.

Enable the real hosted gates explicitly after building:

```sh
COLLAB_BROWSER_TESTS=1 node --test server/tests/browser.test.cjs
COLLAB_REAL_PROJECT=/path/to/test/workspace node --test server/tests/real-project.test.cjs
COLLAB_FULL_EDITOR=1 COLLAB_REAL_PROJECT=/path/to/test/workspace node --test server/tests/full-editor.test.cjs server/tests/source-workflow.test.cjs server/tests/grammar-reload.test.cjs server/tests/reference-publication.test.cjs
```

Keep the test database environment set for these commands. Install Playwright
Chromium (`npx playwright install chromium`) or set `COLLAB_CHROMIUM` to an installed
Chromium executable. Browser example tests use Chrome as configured in
`playwright.config.ts`. Tests make no paid provider requests. Installed Codex
transport verification remains an optional `npm run test:codex-tools` probe.
