# Studio: clone → install → review → deploy

The collaboration deployment targets **studio.academiatupi.com** on the existing Linux VPS.
Normal contributors use [the browser guide](../../docs/collab-contributor.md); they install nothing.
Desktop mode remains separate. This is a reviewed PR/deployment recipe, not a claim that the VPS
has already been changed.

## 1. Prerequisites and a clean install

Laptop: Git, make, Python 3.12+ and OpenSSH. Docker is needed only for the optional local review DB.
Server: Ubuntu/Debian Linux with Git, Python 3.12+, Docker Engine + Compose v2, and util-linux
(`flock`). Existing Neologismo already uses this Docker/SSH deployment pattern. A truly new OS
needs those system tools and an authorized SSH public key first; this installer does not secretly
install OS packages or disable SSH host-key checking. Node/npm/Python application runtimes are
built into the Docker image; neither dependency repository is needed on the laptop.

```sh
git clone https://github.com/kiansheik/pydicate-studio.git
cd pydicate-studio
# Until this PR is merged:
git switch collab-server-kian
make collab-install STUDIO_REF=collab-server-kian
make collab-admin EMAIL=your-email@example.com NAME='Your name'
```

After merge, `make collab-install` defaults to remote `main`. `STUDIO_REF` can be an exact
reviewed commit SHA. The app checkout is downloaded on the server from GitHub—not copied from
uncommitted laptop files. Fresh workspace initialization downloads **oldtupicorpus and nhe-enga**
from the tested revisions in `dependencies.json`. nhe-enga uses a sparse checkout that includes
Pydicate, Tupi, dictionary resources and runtime imports, not the multi-GB scan collection.
Install and update also transfer the PDFs already attached in the deploying laptop's Studio
project, including saved source associations and passage regions. An empty desktop profile
has no PDFs to transfer; contributors can upload their own PDFs in the browser.

The same defaults as Neologismo are in the Makefile:

```text
DEPLOY_HOST=academiatupi.com
DEPLOY_USER=root
DEPLOY_PATH=/srv/pydicate-studio
SSH_IDENTITY=~/.ssh/neologismotupi_ed25519
SSH_PORT=22
NEOLOGISMO_PATH=/srv/nheenga-neologismos
```

Override them as make variables or environment values. Use the **actual SSH VPS host/IP** if the
apex is proxied or points elsewhere. The key stays on your laptop; SSH agent forwarding is not
used. Verify the server fingerprint and establish known_hosts before installation.
`make collab-ssh`, `collab-logs` and `collab-psql` reuse that same connection.

### Desktop PDFs and saved research accompany each update

`make collab-install`, `make collab-redeploy` and `make collab-deploy` automatically read the
native `pydicate-studio` desktop profile and its last opened workspace. On macOS this is
`~/Library/Application Support/pydicate-studio`; on Linux, `$XDG_CONFIG_HOME/pydicate-studio`
(normally `~/.config/pydicate-studio`); on Windows, `%APPDATA%/pydicate-studio`. For a different
profile/workspace:

```sh
make collab-deploy STUDIO_REF=REVIEWED_COMMIT \
  LOCAL_STUDIO_STATE="$HOME/Library/Application Support/pydicate-studio" \
  LOCAL_PROJECT_PARENT="$HOME/code"
```

The source of truth is `evidence/assets/` plus that project's `evidence/sources/` manifests.
All attached/retained managed PDFs for that project are included, even if the original file
has moved. To include another local PDF, attach it to its source in desktop Studio first.
The deployment does not scan unrelated folders or publish local `.tu.py` edits.
A missing default profile is reported and skipped; an explicitly
configured missing profile, invalid manifest or corrupt managed PDF stops before deployment.

Transfer checks SHA-256 and byte counts, rejects unsafe archive paths/links, and remaps the
desktop project identity to the hosted workspace. The application is stopped during import,
inside the normal deployment backup window. Existing hosted PDF selections, uploads and
saved passage regions are preserved; missing assets/regions are added. Exact passage identity
and content, unique matching content, or an identical source file and ordinal establish crop
associations. Changed/ambiguous passages, desktop-only pending lines and sources absent from
the server are retained for review instead of being attached to another line. Guide links are
remapped only when their preceding passage is also identifiable.

The private `data/evidence-imports/<bundle-sha256>.tar` and adjacent `.report.json` retain the
complete portable input and report imported/conflicting/unmatched evidence. Original laptop
file paths are removed from the portable metadata. Identical reruns retain the same archive
and leave evidence revisions unchanged. These archives are covered by full backups. PDF sync
does not grant editorial approval or create saved ground-truth references.

Deployment also snapshots saved drafts, completion/review states, pending passages,
canvases, analysis conversations/candidates/history, lexical notebooks, recovery journals,
parser experiments and usage records. Original source/ground-truth bytes are retained as
provenance. An isolated Electron reader recovers allowlisted local browser buffers and
preferences without opening Studio or its job queues. Provider settings, authentication,
cookies and browser caches are excluded. In-memory undo and tab-local Session Storage
are not persistent research records in this migration.

Every archived file has a byte count and SHA-256. The verified private snapshot lives in
`data/desktop-imports/<sha256>/`, with a reconciliation `receipt.json`; full backups include
it. The importer restores the selected project's current drafts and unambiguous notes.
Unmodified source defaults accept desktop work; changed hosted fields win conflicts,
whose original desktop copies remain recoverable. Historical drafts and records from
other projects remain preserved, without replacing the shared workspace. Repeat imports
do not duplicate changes. Migration revisions have explicit desktop provenance and do
not invent a human author, approval, or resumed AI attempt.

Persisted desktop PDF working copies also become active evidence when the hosted
regions still match the copy's exact saved baseline. Removed rectangles and empty
region lists are authoritative. Different online evidence, ambiguous origins and
unmapped historical passages remain untouched and are reported. A content-based
receipt prevents repeat deployments from replaying a correction over later edits.

Administrators can open **Histórico do desktop** in the collaboration panel to read original
drafts, conversations, note versions and other records, including unresolved links. Browser
Unresolved browser buffers/preferences can be restored to that administrator's browser without overwriting
existing local work; old AI retry records remain historical. Shared migrated draft progress
is available to ordinary collaborators in the usual editor.

The installer creates dedicated persistent `workspace/`, `data/`, `config/`, release directories,
and PostgreSQL 17 on a private Docker network. The application DB role is not a superuser.
No database port is published, no other application's database is changed, and existing volumes
are not deleted. Secrets are generated once outside the checkout. Never commit `config/` or backups.
The initial admin password is prompted through stdin/TTY, never put in process arguments.

## 2. SMTP and DNS: one-time setup

Default `SMTP_MODE=relay` discovers the **existing Neologismo smtp-relay** by its Compose labels
and deployment directory, then joins that private network. It does not copy upstream passwords
or publish SMTP. Ambiguous/missing relays fail rather than guessing. `SMTP_MODE=direct` creates
blank direct-SMTP settings for you to edit in `DEPLOY_PATH/config/runtime.env`; `SMTP_MODE=none`
is useful for isolated tests. Already-saved SMTP settings are preserved on redeploy.

Follow [DNS.md](DNS.md). Add `studio` to the VPS origin and add the Caddy fragment to the existing
shared edge; do not replace the Neo frontend or deploy a second public Caddy. After that one-time
setup, application updates use a single command.

## 3. The daily command

```sh
make collab-deploy             # remote main after this PR is merged
# Or an exact reviewed app build:
make collab-deploy STUDIO_REF=FULL_COMMIT_SHA
```

Before uploading PDFs, deployment fetches the requested ref and checks that it
contains the server installer, configuration and PDF importer. It then pins that
full commit SHA for the rest of the operation, so a branch update during transfer
cannot change the application being deployed. A release without collaboration
support stops before the upload and leaves the running application intact.

The PDF upload shows a terminal progress bar with transferred bytes, percentage,
speed and estimated time remaining. When output is redirected, progress is written
as periodic lines. The upload ETA covers the transfer only: server checkout, image
build, backups, source synchronization, migrations, PDF import and health checks
have separate status messages and retain their command output. Those phases do not
have a reliable total duration, so no overall percentage or ETA is invented.
An upload with no byte progress for 180 seconds stops before deployment; SSH
connection setup is bounded to 15 seconds and keepalives detect broken links.
Ctrl-C cancels the local upload cleanly. Bytes shown are handed to SSH; its exit
status and the server's SHA-256 must both succeed before the release is updated.
The local upload display works immediately from this checkout. New server phase
labels require deploying a published `STUDIO_REF` containing the updated host script.

The app builds while the old instance runs. It then pauses the app for a full safety checkpoint,
fast-forwards **clean compatible** corpus/grammar branches, migrates PostgreSQL, starts the new
image and waits for health. It updates `current` and records all three SHAs in `release.json`.
If server working files are dirty or contain commits not yet merged upstream, they are preserved
and the command reports that their upstream synchronization was deferred. It never does reset,
stash, clean, force push or silent conflict resolution. A failed deploy leaves recoverable old
release/data; inspect the failure before restarting.

This is a short supervised restart, not a zero-downtime deployment. Connected browsers retain
unconfirmed work, reconnect and show a reload notice. Ask contributors to wait for “saved” before
maintenance. The web UI remains the same; old unsaved buffers are never overwritten automatically.

### Automatic corpus and grammar updates

Installation/deployment enables `pydicate-studio-upstream.timer` on the host. Every
15 minutes (with up to 30 seconds of jitter) it checks the public `main` branches
of `nhe-enga` and `oldtupicorpus`. It never updates the Studio application itself.
The authenticated collaboration panel reports current/upstream revisions, waiting
conditions and completed updates through `GET /api/upstream-status`.

Automatic application requires both repositories to be clean, on `server/work`
and compatible with fast-forward updates. Dirty files, local commits not merged
upstream or an unexpected origin defer the update; nothing is reset or stashed.
The app must report at least ten minutes without interaction or active work using
a fresh private heartbeat. Active presence, explicit actions and PDF downloads
reset the idle clock; passive status polling and idle browser tabs do not.

Before stopping, the updater obtains a short private maintenance lease. The app
grants it only after finite work has drained, then refuses new work temporarily
with a retryable status. The updater rechecks repository state, takes **one full
backup of both repositories, PostgreSQL, PDF/state and configuration**, and applies
only the checked fast-forwards. It restores ownership, restarts Studio, waits for
health and records actual dependency SHAs in `release.json`. Existing browser
sessions receive a reload notice; unsaved local buffers are not silently replaced.

Backups remain under `backups/upstream-*` and are not automatically deleted. Private
handshake/status files live under `data/operations/`; a missing or stale heartbeat
prevents an automatic update. The existing operations lock serializes this with
manual deployment, backup, review and restore. Failure or a normal timeout releases
the lease and attempts to restart the preserved workspace; inspect any failed
health check. A forced machine/process kill still requires ordinary operational
recovery.

On the VPS, inspect or pause the timer with:

```sh
systemctl status pydicate-studio-upstream.timer
journalctl -u pydicate-studio-upstream.service --since today
touch /srv/pydicate-studio/config/upstream-disabled
systemctl disable --now pydicate-studio-upstream.timer
# Resume checks:
rm /srv/pydicate-studio/config/upstream-disabled
systemctl enable --now pydicate-studio-upstream.timer
```

Disabling the timer stops future checks, not a check already running. The optional
`config/upstream-disabled` marker preserves that pause across later deployments
and also makes a manually started check report that automatic updates are disabled.
Adjust the root path above if using a different deployment directory.
To run one check immediately, use `systemctl start pydicate-studio-upstream.service`;
it still requires the same idle lease and full backup. A stopped Studio instance
is not started automatically by a timer check.

## 4. PostgreSQL and research preservation

Accounts, password hashes, sessions, shared draft state, every acknowledged changed draft,
comments, immutable submissions, review/publication events, notifications and optional encrypted
provider settings are in PostgreSQL. **There is no automatic expiry of scientific or usage
records**. PostgreSQL triggers reject ordinary UPDATE/DELETE of audit, revisions and submissions;
this is not a tamper-proof guarantee against the database owner. Sessions, reset links and
short-lived passage reservations still expire for security.

```sh
make collab-db-backup FILE=backups/studio-2026-09-27.dump
make collab-backup FILE=backups/studio-2026-09-27-full.tar.gz
make collab-research FILE=backups/studio-2026-09-27-research.tar.gz
```

The DB dump uses `pg_dump -Fc`. The full checkpoint pauses the app and includes the DB dump,
PDF/evidence/worker state, both Git workspaces, config and secret keys, with SHA-256 manifests.
SSH downloads verify checksums and refuse to replace an existing local file. Full backups are
**private and contain credentials**: encrypt them at rest/offsite and keep them out of Git and
thesis appendices. Research exports include versioned JSONL and checksums, without credential
columns or account email fields; free-text comments can still contain personal data and need
human anonymization before publication.

A DB-only dump contains drafts/submissions but **not** the PDF files or arbitrary working-tree
edits. That is why a full backup is a separate command. Do not describe a DB-only restore as a
complete disaster-recovery restore.

Production restores require explicit host-bound confirmation and take a safety backup first:

```sh
make collab-db-restore FILE=backups/studio.dump CONFIRM=RESTORE-STUDIO-PRODUCTION@academiatupi.com
make collab-restore FILE=backups/studio-full.tar.gz CONFIRM=RESTORE-STUDIO-PRODUCTION@academiatupi.com
# Restore leaves the application stopped. Verify matching repos/PDFs/config first:
make collab-start
```

Only restore trusted dumps: SQL dumps can execute source database code. Restore is a single DB
transaction; sessions/reset tokens are revoked afterward. Full restore keeps destination SMTP,
domain and database passwords, restores the provider encryption key and matching data/workspace,
and preserves the previous directories. Test recovery on a disposable host before relying on it.

A pilot with the older SQLite build must explicitly run `server/migrate-sqlite.cjs` against an
empty PostgreSQL target. The converter preserves users/drafts/comments/revisions/events, records
counts/checksums and revokes sessions. Startup refuses to ignore an unmigrated SQLite file.

## 5. Recommended contribution loop: PostgreSQL for drafts, Git for review

A Git branch for every autosave is unnecessary and makes editing shared lexicon prerequisites
harder. Instead:

- The current passage has a user/tab reservation and version-checked shared draft.
- Every author keeps their acknowledged versions in the append-only revision history.
- **Enviar última versão salva para revisão** freezes an author-specific immutable submission.
  Two people can submit different versions of the same passage without overwriting either submission.
- Materialize selected submissions in **a review batch** on new local branches/worktrees off `main`.
  Test/review there, merge normal Git PRs, then deploy. Nothing automatically approves ground truth.

From a laptop DB backup:

```sh
make collab-db-restore-local FILE=backups/studio.dump LOCAL_REVIEW_DIR="$HOME/studio-review/september"
make collab-submissions-local LOCAL_REVIEW_DIR="$HOME/studio-review/september" IDS=UUID_1,UUID_2 FILE=backups/selected-submissions.json
make collab-import FILE=backups/selected-submissions.json LOCAL_REPOS_PARENT="$HOME/code" IMPORT_DIR="$HOME/studio-review/batch-001"
```

The local review database has no published port and starts no web, SMTP or AI worker. Use a **new**
review directory for each restore; existing data is not overwritten. The importer verifies the
frozen JSON hashes, fetches the two repositories, and creates worktrees/branches from `origin/main`
without touching files in your existing working directories. It evaluates each selected analysis
with the actual Python engine, applies a reviewed-format source preview and creates proposal
commits with submission/hash/author-ID trailers. It refuses changed or ambiguous source anchors,
unresolved prerequisites and failed/partial evaluation. The nhe-enga branch can be unchanged;
no grammar modification is fabricated merely because two branches were created.

The importer does **not** push, merge or approve ground truth. Review/test the pair using Studio
and the repositories' own tests, make any needed grammar/source corrections, push the branches
and open PRs using your laptop GitHub credentials. Keep the `import-receipt.json` private. After
those commits are pushed:

```sh
make collab-record-import FILE="$HOME/studio-review/batch-001/import-receipt.json"
# Review and merge the PRs on GitHub using a merge commit, then:
make collab-deploy
```

Registration verifies commit trailers against the exact frozen submission. On synchronization,
only commits proved to be ancestors of both fetched `main` and the deployed HEAD receive “merged”
status/notifications. **Use merge commits, not squash/rebase merging**, to retain that proof.
A squash merge is not falsely reported as integrated; it needs manual reconciliation. Importing
two alternative submissions for one passage may conflict; choose/reconcile deliberately.

Already-reviewed edits made directly in the server's corpus checkout have a separate escape hatch:

```sh
make collab-changes REPO=oldtupicorpus FILE=backups/source-review.tar.gz
# Inspect review.diff, new-files and manifest.reviewSha:
make collab-publish REPO=oldtupicorpus REVIEW_SHA=EXACT_MANIFEST_HASH FILE=backups/source-publication.tar.gz
make collab-sync REPO=oldtupicorpus
```

This freezes an exact reviewed server snapshot, downloads a verifiable Git bundle, then uses
**laptop** `git`/`gh` credentials to open a PR. Only allowlisted scientific paths are accepted;
new files are not silently omitted. Repeat for `nhe-enga` only when there really are reviewed
grammar changes. Web grammar editing remains disabled initially. Prefer the submission loop
for new paid contributors; the aggregate escape hatch is not a per-line payment ledger.

## 6. Merge summaries and AI

Merge summaries have a durable outbox. They are **off by default**. To send queued confirmed merges:

```sh
make collab-notify MODE=daily       # or hourly
```

For automatic summaries, set `COLLAB_DIGEST_MODE=daily` or `hourly` in the private runtime.env
and redeploy. The server checks once per minute and groups not-yet-notified merges from completed
UTC day/hour buckets. Failed SMTP deliveries are retried; a stable Message-ID helps de-duplication.
SMTP cannot guarantee exactly-once delivery after a crash between send and acknowledgement.
“Integrated” does not imply a Pix payment. No newsletter or email task is created in ChatGPT.

The UI can store each user's **optional API-key preferences**, encrypted with AES-GCM and bound
to that user/provider. The vault key stays outside PostgreSQL. Site-funded vs personal funding
and future monthly limits are explicit, but generation is **still disabled** and enabling
`COLLAB_AI_ENABLED=1` deliberately fails until a separately reviewed provider/budget worker ships.
Do not share a personal Codex/Claude subscription login or auth.json among contributors.
Production site funding should use a dedicated provider project/service identity; personal
API keys are optional. Secrets never go in Git, research exports or contributor browser responses.

## Verification

`make collab-test` needs `COLLAB_TEST_DATABASE_URL` pointing to a disposable PostgreSQL DB; tests
create random schemas. The clean-install CI uses a fresh SSH target, real PostgreSQL/Docker/Caddy,
a private fake SMTP relay and the exact Make commands above. It checks fresh remote repository
installation, login, edits, PDF bytes, backup/redeploy/restore and source integrity; the artifacts
contain the verification report, **never actual backups or secrets**. Public DNS and your real
SMTP delivery still need a staging check on the intended VPS.

## 7. Enable the shared Neo login after reviewing both PRs

Studio never copies Neo passwords/hashes or reads the Neo PostgreSQL database. The companion
Neologismo PR implements a fixed, one-use-code identity exchange using the normal Neo login and
verified email. Studio keeps its own roles, invitations and host-only sessions. Before activation,
keep the bootstrap local administrator as a recovery account.

After installing Studio and merging the companion Neo identity PR:

```sh
# Uses the same SSH key. Backs up both private env files; no secret printed or restart:
make collab-sso-config
# For a different *effective Docker API env file*:
make collab-sso-config NEO_API_ENV_FILE=/srv/nheenga-neologismos/deploy/env/api.env
# Deploy Neologismo using its own repository's reviewed Makefile workflow first.
# Then restart/update Studio:
make collab-deploy
```

The command preserves before-images and writes only `STUDIO_SSO_*` in the Neo env and
`COLLAB_NEO_*` in Studio; the generated client secret is separate from passwords and cookie
signing keys. Ensure the usual Neo deploy does not overwrite those newly configured values
with an older laptop environment file. No DNS/CORS/shared-cookie change is needed for identity.

Invite the same verified Neo email. On the invitation page choose **Entrar com Academia Tupi /
Neologismos**, confirm the Neo account, and return to Studio. Existing local Studio users must
explicitly link their account after confirming their current Studio password; email matching
alone does not link accounts. The final local administrator cannot be converted or disabled.
A Neo account without a Studio invitation cannot enter, and Neo admin status is not imported.

Neo password/email changes or account disabling invalidate linked access within the one-minute
recheck window. Neo outages fail closed for linked sessions; local recovery login still works.
Signing out of Neo does not automatically sign out of an already-issued Studio session.
Keep using the standard Neo password-reset/verification flow for linked users.
