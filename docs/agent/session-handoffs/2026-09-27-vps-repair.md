# Existing VPS collaboration repair — 2026-09-27

## Goal

Diagnose the stopped migration and complete the authorized Studio installation,
recovery login, invited Neo identity, HTTPS routing, collaboration QA and backup.
This continues the [original stopped QA](2026-09-27-vps-qa.md), which remains a
historical record. Neither PR is authorized for merge.

## Files inspected

- Agent index, current state, repository map, open questions and prior QA handoff.
- `deploy/collab/compose.yml`, `server/migrate.cjs`, database initialization,
  startup, authentication/identity and hosted editor tests.
- `.github/workflows/collab.yml`, `server/tests/helpers.cjs`,
  `scripts/collab/{host,ops,sso_setup}.py` and operations tests.
- VPS Docker networks, selected PostgreSQL/application logs, workspace Git file
  ownership, private SSO configuration and the existing Caddy configuration.
  Secret values and recovery credentials were not printed.

## Files changed

- Commit `ae08de2`: dedicated Studio PostgreSQL network alias/`PGHOST`, sanitized
  migration error codes, and PostgreSQL service/test URL in collaboration CI.
- Commit `871de34`: `scripts/collab/host.py` restores application ownership after
  host Git operations, including failure paths; operations regressions cover
  deploy, sync, publication and import. Both commits were pushed to the existing
  Studio branch; no merge was performed. Commit `30d8120` repairs the compiled
  editor fixture to enable advanced tools before opening Code, and permits the
  existing `COLLAB_CHROMIUM` override for local browser validation.
- Created private `.local/vps-qa/recovery-admin.json` with mode `600` for the
  independent recovery administrator. Do not publish its contents.
- Configured private Studio/Neo SSO with before-images. Mirrored the private Neo
  settings to the laptop `api.env`; its original before-image is in ignored
  `.local` storage. Neo retained release `20260927133536-23ad031`.
- Appended only Studio's block to the existing Caddyfile. Before-image:
  `/srv/xe-roka/deploy/docker/caddy/Caddyfile.before-studio-20260927T140601Z`.
- Current state, work log, repository map and this handoff.

## Commands run

- Targeted `rg`, Git inspection, SSH diagnostics, Docker network/name resolution,
  PostgreSQL connection checks and application health requests.
- A private diagnostic connection with
  `PGHOST=pydicate-studio-postgres-1` verified Studio credentials and its database
  before migration; no application tables existed yet.
- Published `ae08de2`, then retried installation successfully with
  `make collab-install STUDIO_REF=ae08de28fea882d9d66319436620f764540b91ee`.
- Ran `make collab-sso-config`, recovery administrator bootstrap, Neo restart,
  Caddy validation/reload and real-browser recovery login/invitation workflows.
- First SSO redeploy exposed the Git ownership bug. Existing `host.prepare`
  ownership restoration followed by application start restored service.
- Published `871de34`; ordinary `make collab-deploy` using its full commit SHA
  succeeded. Verified workspace Git metadata belongs to application UID/GID
  `1000` even when its mode is `600`.
- Installed locked server dependencies with `npm --prefix server ci`. Against a
  disposable PostgreSQL 17.9 cluster, ran `node --test server/tests/*.test.cjs`
  with `COLLAB_TEST_DATABASE_URL`, `COLLAB_BROWSER_TESTS=1` and system Chrome.
- Ran `python3 -m unittest discover -s scripts/collab/tests -v`, Python syntax
  compilation and `git diff --check`.
- Built the app and ran the real-project and compiled full-editor suites against
  disposable copies of the exact deployed corpus/engine revisions. Both passed;
  original neighboring sources and tracked fixture files remained unchanged.
- Executed the reviewed private `.local/vps-qa/live-qa.cjs` against public HTTPS,
  then `make collab-backup FILE=backups/studio-first-qa.tar.gz`. Verified the outer
  checksum and both manifest file checksums without extracting secrets.
- Rechecked HTTPS health after the backup restart and inspected PR #2 checks.
- Ran the real Neo identity contract with `NEO_API_DIR` pointing to its actual
  checkout and `NEO_PYTHON` to its virtualenv, but disposable SQLite, media and
  localhost PostgreSQL only. No production account changes were made.
- From the deployed Studio container, used its actual identity client to call
  Neo introspection for the nonexistent all-zero UUID. Authenticated response
  was `active:false`; no secret, hash or real-user response was printed.

## What worked

- Root cause confirmed: Studio joined Neo's SMTP network, where the generic
  `postgres` name resolved to Neo at `172.18.0.2` rather than Studio's database at
  `172.21.0.2`. Neo logged that `studio_app` did not exist. The dedicated Studio
  hostname connected successfully; no database reset was needed.
- After the routing fix, installation applied all three Studio migrations and
  reached application health successfully.
- Recovery administrator login opened the real hosted editor. Public HTTPS
  health passed, and authentication options reported Neo login enabled.
- Caddy validation and reload succeeded. Neo kept its existing release while
  receiving the SSO configuration.
- An administrator invitation was sent to `ksheik@usp.br`; the SMTP relay
  reported `status=sent`. This does not establish inbox receipt or completed
  personal Neo login. The independent local recovery admin remains separate.
- Server suite: **31 passed, 0 failed, 3 gated skips**, including the two-browser
  transport workflow with independent edits, stale conflicts, comments, presence
  and expired-session recovery. Skips: real Neo integration, real-project
  adapter and compiled full editor. The latter two subsequently passed separately
  (50.7 s and 68.5 s). The disposable database schemas were removed and PostgreSQL
  stopped cleanly.
- Operations suite: **12 passed**. Real local Git under umask `077` reproduced
  private Git metadata creation; mocked ownership calls verified restoration
  before migration, restart and verification, including failed fetch and rejected
  publication. Syntax/whitespace checks passed. The ordinary VPS redeploy also
  passed with application-owned Git metadata and healthy startup.
- All four CI runs on `30d8120` passed: both collaboration runs, including the
  full compiled editor, and both general Checks runs. The last completed at
  `2026-09-27T14:21:54Z`. Neo PR #21 identity checks are also green. Both PRs remain
  open and unmerged.
- Real Neo contract: **1 passed**, verifying invited identity, separate cookies,
  no copied password hash, rejection of Neo cookies by Studio and Studio session
  revocation after Neo password revision changes. Fixture schemas were removed
  and its temporary PostgreSQL cluster stopped. Live server-to-server
  introspection also confirmed deployment connectivity and shared-secret
  agreement; the user's personal browser sign-in remains unconfirmed.
- Live QA passed on Araújo passage 67: real engine evaluation, saved whitespace
  edit/reload, labeled comment, presence and reservation conflict in a second
  isolated browser, immutable submission, correct authorship, history/activity.
  Both browsers used the recovery account; distinct production users were not
  tested. The original draft was restored and the reservation released. Source
  files were unchanged and no editorial approval was created.
- Full backup downloaded privately (21,217,468 bytes, mode `600`); outer and
  internal checksum verification passed. Public health remained OK afterward.

## Live state and private evidence

- Studio: `871de3483dd43dc22741790d7a243bed7f85a13d`; latest branch test-only repair:
  `30d8120530580323e974e8d3c1544283f3663aa9`.
- Corpus: `f520ffceb62b0806718e5ca0eb8d7dbae3c8f9f2`;
  engine: `eef5d62fb4b9feb443395211c064b8edeb73c5e2`.
- Neo: `23ad031d3c128b4f235372a2cf14c38fe55e8c8f`, release
  `20260927133536-23ad031`.
- Recovery credentials: `.local/vps-qa/recovery-admin.json` (mode `600`, ignored).
- Live report: `.local/vps-qa/live-qa-2026-09-27T14-11-11.660Z.json`; screenshot
  `live-qa-success-2026-09-27T14-11-11.660Z.png` in the same private directory.
- Original draft backup: `.local/vps-qa/live-qa-original-2026-09-27T14-11-11.660Z.json`.
- Technical QA submission: `070601ab-dd00-49ec-896a-0a1025224e29`. Clearly labeled
  QA comment/submission/history remain intentionally for the audit trail.
- First full backup: `backups/studio-first-qa.tar.gz` and `.sha256` (ignored).
  Contains private configuration; do not publish or print its contents.
- Private operation logs and environment before-images remain under
  `.local/vps-qa/`; original Neo DB/media backups remain in its ignored backups.

## What failed

- Generic database DNS sent the original migration to Neo. The fix uses a unique
  alias on Studio's private database network, and migration failures now expose
  a sanitized code without printing credentials.
- The first SSO redeploy reached `GIT_ERROR`: host-side root Git operations under
  umask `077` replaced `.git/index` and `.git/ORIG_HEAD` with root-owned mode
  `600` files, even when merge reported “Already up to date.” The container's
  UID `1000` could no longer read them. Commit `871de34` restores ownership in
  `finally` before application use, preserving config secrecy and symlink bounds.
- Collaboration CI then exposed an outdated compiled-editor test setup: Code
  is hidden until advanced tools are enabled. Commit `30d8120` uses the actual UI
  controls first; the assertions remain intact. Local and hosted checks passed.
- One install retry used an abbreviated commit SHA, which remote Git could not
  fetch. Retrying with the full SHA succeeded; no database reset was performed.
- Sandboxed local dependency retrieval and PostgreSQL shared-memory creation were
  blocked; approved execution completed both without using production databases.
- The first real-Neo fixture run hit its tight startup readiness deadline before
  any authentication exchange. Standalone startup succeeded in 8.79 s; the
  unchanged contract then passed. Cold-start fixture timing remains a possible
  source of test flakiness; this was not a production identity failure.

## Remaining questions

- Obtain the user's Neo login confirmation. An accepted invitation email and
  enabled SSO option do not establish the full identity round trip.
- Keep recovery credentials, private environment values and backup contents out
  of Git and public logs. No PRs have been merged.

## Suggested next prompt

Confirm the invited Neo account can enter Studio with its existing login. If it
fails, inspect the bounded identity error and relay/session state without
requesting passwords or converting the recovery administrator. Preserve the
working deployments, private backup and original historical sources. Do not
merge either PR without authorization.
