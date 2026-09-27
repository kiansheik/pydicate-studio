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
The actual witness PDF is uploaded by a reviewer; it is not invented from an empty clone.

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
