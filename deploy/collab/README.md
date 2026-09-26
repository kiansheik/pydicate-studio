# Host Studio alongside Academia Tupi / Neologismo

This directory is an optional deployment, not a production change. Read
[the collaboration contract](../../docs/design/collab-server.md) first. Desktop commands stay
unchanged. Use a staging hostname before inviting paid contributors.

## Prepare trusted repositories and configuration

Prepare a dedicated directory containing sibling `oldtupicorpus` and `nhe-enga` checkouts.
Do not mount your personal working copy. Keep the engine read-only; give container UID 1000
write access to the dedicated corpus and its `.git` directory. Use a corpus working branch for
server-reviewed changes; this mode does not push or merge into GitHub automatically.

Build from the reviewed Studio PR checkout:

```sh
cp deploy/collab/.env.example deploy/collab/.env
chmod 600 deploy/collab/.env
# Edit COLLAB_WORKSPACE, COLLAB_PUBLIC_URL and SMTP settings locally.
docker compose --env-file deploy/collab/.env -f deploy/collab/compose.yml build
```

The `.env` next to compose.yml supplies service credentials. For Compose interpolation of
workspace/network settings, explicitly supply `--env-file deploy/collab/.env` in subsequent
commands (and in `build` when Compose validates volume paths).

```sh
docker compose --env-file deploy/collab/.env -f deploy/collab/compose.yml run --rm studio \
  node server/admin.cjs bootstrap --email YOUR_EMAIL --name 'Your name'
```

The bootstrap command prompts securely; there is no default password and no password in process
arguments. It refuses once an active administrator exists. Use the web admin panel for further
invitations. Noninteractive input reads the password from stdin only; do not paste it into a
committed script or command history.

```sh
docker compose --env-file deploy/collab/.env -f deploy/collab/compose.yml up -d
```

## Reuse the existing edge and SMTP

The service joins existing `caddy_edge` as `pydicate-studio`. No backend port is published.
Add the supplied `Caddyfile.fragment` to your existing shared Caddy config, validate it using
that deployment's normal command, then reload it. Add DNS for `studio.academiatupi.com` pointing
to the same VPS. Do not replace the existing `academiatupi.com` or `api.academiatupi.com` sites.
These instructions do not make DNS/Caddy changes automatically.

For direct Namecheap SMTP, configure the same mail server/account with STARTTLS port 587.
For the existing Docker `smtp-relay`, first inspect its actual private Docker network; configure
`COLLAB_SMTP_NETWORK` and add the overlay consistently to every Compose command:

```sh
docker compose --env-file deploy/collab/.env \
  -f deploy/collab/compose.yml -f deploy/collab/relay.compose.yml up -d
```

This reuses the relay's configured upstream credentials without copying them into Studio.
Plaintext unauthenticated port 25 is permitted only inside that trusted private network. Never
publish it. No Neologismo account/password database is shared: Studio accounts are separate.

## Without Docker / local staging

Linux, Node 22.16+, Python 3.10+, Git and `flock` (util-linux) are needed. Install the normal
Studio dependencies and build with `npm ci && npm run build:app`. Set
`PYDICATE_PROJECT_PARENT` and `COLLAB_STATE_DIR` to dedicated writable paths and
`COLLAB_PUBLIC_URL` to an HTTPS origin. Bootstrap with `npm run collab:admin -- bootstrap
--email YOUR_EMAIL --name 'Your name'`, then `npm run collab`. Do not run `server/index.cjs`
directly or start multiple replicas. The lock wrapper releases correctly after crashes.

Loopback-only testing can explicitly use `COLLAB_ALLOW_HTTP=1`,
`COLLAB_PUBLIC_URL=http://127.0.0.1:8787`, and `COLLAB_HOST=127.0.0.1`.
Never enable this on the public VPS interface. Run under an unprivileged service account and
arrange systemd supervision or use the supplied container restart policy.

## Data, backups and recovery

The named `studio_data` volume contains `collab.sqlite` (including private accounts), SQLite
WAL/SHM, worker state, evidence manifests and PDFs, original uploads and local service files.
The bind-mounted corpus contains explicitly reviewed source changes. Back up the **entire data
volume and corpus together**, plus record the Studio and read-only engine commit SHAs.

For a consistent initial backup, stop Studio, archive the data volume and corpus with owner-only
permissions, then start Studio. Do not copy only a live SQLite database while ignoring its WAL.
Encrypt off-server backups; test restore into an isolated staging instance, including login,
comments, draft versions and PDF rendering. Never put this volume, SMTP `.env`, account exports
or recovery files in a public Git repository.

After an interrupted source publication, keep the original workspace and before-image journals.
Use the existing desktop/offline recovery workflow on a backed-up copy; hosted recovery writes
are deliberately denied. Resetting the container without deleting volumes preserves accounts
and drafts. Do not delete the database as a deployment troubleshooting shortcut.

## Pilot checklist

Invite one contributor and one reviewer. Confirm invite/reset delivery, contributor rejection of
source approval, two users editing different passages, same-passage rejection, reconnect with
local recovery export, comment replies/resolution, account disable/revocation, actual Araújo PDF
upload/view/crops, and full backup restoration. Inspect the admin activity report; do not treat
presence or browser events as hours, accepted text, or an automatic Pix payment ledger.
