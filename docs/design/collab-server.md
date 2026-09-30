# Optional collaboration server — research, Git and identity

This is a single-workspace, invitation-only Linux mode of the existing Studio, not a replacement
for Electron. The hosted HTML loads the existing compiled React editor plus a browser transport
and collaboration panel. The real Node/Python authoring service evaluates the selected trusted
corpus and grammar; no simulated linguistic output replaces it. Run through `npm run collab` or
the [Makefile deployment workflow](../../deploy/collab/README.md). PostgreSQL 17 is required for
this mode. Desktop dependencies and local storage remain independent.

## Who stores what

| Data | Authority |
| --- | --- |
| Account, role, invitation, local session | Studio PostgreSQL; optional Neo identity link |
| Password of a linked Neo account | Neo only: never copied into Studio |
| Current shared passage draft | PostgreSQL, per-passage compare-and-swap version |
| Every acknowledged changed save | Immutable before/after revision with server-derived author |
| Submitted alternative analysis | Immutable author/revision snapshot and SHA-256 |
| Discussions, review decisions, publication receipts | PostgreSQL |
| Reviewed source, lexical definitions and morphology code | `oldtupicorpus` / `nhe-enga` Git repositories |
| PDF bytes, evidence geometry, worker recovery files | Private managed files, included in full backup |
| Imported desktop research and provenance | SHA-256 verified private archives; current drafts reconciled into PostgreSQL |
| Shared Codex login and AI history | Private server files; login is SSH-installed, never browser-readable |
| Optional personal API keys | Encrypted PostgreSQL vault; independent from shared Codex execution |

There is no automatic expiry of research/usage records and no 30-second coalescing of revisions.
Every acknowledged save that changes a draft retains its exact before/after values. No-op saves
need not create another revision. Audit, revisions, submissions and submission-events tables
reject ordinary UPDATE/DELETE through triggers. A database owner can bypass protections; this is
not cryptographic tamper-proof storage. Export manifests contain row counts, migration checksums,
application/repository context and file hashes. Research JSONL excludes account emails, password
hashes, sessions, SMTP settings and provider secrets, but free-text scientific notes may still
contain personal information. Review/anonymize before publication. Participants see the retention
and shared-workspace disclosure before login.

Sessions, password-reset tokens, one-use identity codes and presence leases still expire. Their
expiry is a security boundary, not research-data deletion.

Desktop migration is an explicit stopped-service deployment step after a full checkpoint.
Source identity proofs remap current passages across machines; per-field comparisons with
the first hosted revision preserve online changes. Original drafts, completion timestamps,
conversations, note history and unresolved records remain in an immutable input archive.
The administrator history reader never starts the desktop analysis service or resumes
provider jobs. Shared active state and private historical prompts have separate access paths.

## Editing and review are different operations

Multiple people can work on different passages. A reservation belongs to a user **and tab**, lasts
120 seconds and renews with active heartbeats. Concurrent stale saves are rejected; no automatic
keystroke/tree merge is claimed. Other people's saved editor state loads through **Carregar estado
compartilhado**. Presence and comments update live. Session/network errors preserve the local
recovery-export path; maintenance still benefits from contributors waiting for a saved confirmation.

The shared current draft is a working surface, not the only copy of a person's work. Each saved
revision retains its author. **Enviar última versão salva para revisão** freezes the author's
specific saved version. A subsequent edit, including another person's edit, cannot change that
submission. Review decisions bind the exact snapshot hash. Ready, imported, merged and approved
ground truth are separate states. A browser cannot invent a server author or a publication receipt.

The recommended maintainer loop is:

1. Download a PostgreSQL dump; restore it to a new isolated laptop review database.
2. Export selected immutable submissions from that snapshot.
3. Create new local Git worktrees/branches off `origin/main` in **both** dependency repositories.
   The original laptop worktrees, including uncommitted work, are not checked out/reset.
4. Re-evaluate with the real Python engine, preview/apply the chosen source changes, and create
   proposal commits containing submission/hash/pseudonymous-author trailers. Changed/ambiguous
   source anchors and partial evaluation stop the import. No ground-truth approval is manufactured.
5. Review/test, make any necessary grammar corrections in the sibling worktree, push normal PRs
   using laptop credentials, and merge with a merge commit so receipt ancestry survives.
6. Register the exact import receipt on the server and run `make collab-deploy`. Only clean,
   compatible server branches fast-forward; dirty/unmerged work is retained and reported.

A prepared grammar branch may have no changes: the importer does not invent one merely to fill
both repositories. Direct reviewed server source edits also have a hash-guarded collect/bundle/PR
workflow. Neither path puts a GitHub write token or a “merge arbitrary branch into main” endpoint
in the web process. Per-keystroke Git branches would add coordination complexity without replacing
the need for immutable submissions and human review.

Confirmed merge receipts require the imported commit to be an ancestor of **both** fetched main
and the deployed repository HEAD. A receipt is provenance, not a linguistic test or Pix entitlement.
An unchanged pending shell is retired only after confirmed integration; later local revisions stay
intact. Preserve merge commits; squash/rebase merging requires manual receipt reconciliation.
Hourly/daily mail digests use a durable outbox and are off by default. SMTP acknowledgement is not
an exactly-once-delivery guarantee across crashes.

## PostgreSQL and deployment integrity

The optional `server/` package pins `pg` independently of desktop dependencies. All SQL is
parameterized; transactions use one bound connection. Versioned/checksummed migrations run before
service startup. An exclusive database advisory lock and Linux filesystem lock keep one web
instance in charge of the selected filesystem/Python runtime. Lost DB ownership fails closed.
Do not horizontally scale this filesystem-backed runtime or put its workspace on NFS.

The generated deployment uses a dedicated non-superuser application DB role and an unexposed
PostgreSQL service. Laptop operations use SSH with the existing Neologismo identity/host defaults
and verified host keys. No SSH agent or laptop key is mounted into the application.

Application releases live separately from persistent repositories/data/config. Fresh installs
fetch pinned public corpus/grammar commits; subsequent deployments build the app before stopping
it, take a full checkpoint, migrate DB and fast-forward only safe repository states. No reset,
stash, forced push or database-volume deletion is part of redeploy. This is a supervised restart,
not zero downtime. A failed upgrade preserves old releases and recovery data for inspection.

DB-only dumps capture draft/submission/account data, not PDF bytes or arbitrary dirty Git files.
Full backups pause the app and include the DB, both workspaces, managed files and private config.
They contain secrets and must be encrypted/restricted offsite. Restore requires explicit host-bound
confirmation plus a safety checkpoint and leaves the app stopped until matched source/PDF state
is checked. A reviewed converter imports a legacy SQLite pilot only into an empty PostgreSQL DB;
it never silently starts fresh and abandons the old data.

The desktop envelope validator still limits the active workspace to 5,000 drafts; hosted aggregate
payload is capped at 64 MiB and individual HTTP save patches at 4 MiB. These are active-workspace
limits, **not** deletion or retention limits for historical PostgreSQL rows. PDFs retain the
100 MiB per-upload/250 MiB managed-original allowance. Plan archival/sharding before those active
working-set limits, without discarding the research history.

## One Academia Tupi account, separate authorization

The optional companion Neo PR adds a **fixed first-party authorization-code bridge**, not a
claim of general OIDC-provider interoperability. Neo continues to use its normal login, bot
verification, email verification and Argon2 password record. Studio redirects to Neo for account
confirmation; logged-out people open the existing Neo login in another tab, then continue.

A short-lived, single-use code is bound to the exact configured redirect, client, S256 PKCE,
issuing Neo session and password/email revision. Studio also binds the request to one browser
with a random flow cookie and state. The server exchanges the code using a separate client secret,
checks issuer/audience/verified email and links an invited Studio account to the stable Neo user ID.
The code returns in a fragment cleared by the callback page, not a proxy query string. No password,
password hash, reusable Neo access token or Neo session cookie enters the Studio database.

An existing Neo account does not automatically gain Studio access or administrative privileges.
First linking needs a valid invitation for that verified email. Linking an existing local Studio
account additionally requires its current password; matching email alone cannot take it over.
Keep at least one local administrator for recovery if Neo is unavailable. Once linked, reset the
password in Neo; Studio does not maintain a second password for that user.

Studio issues its own host-only session cookie. Existing Neo cookie settings/CORS are not widened.
Linked sessions recheck active/verified account and opaque credential revision at most once per
minute. Neo password/email changes and account disabling invalidate access on that check; a Neo
outage fails closed for linked accounts. This is not single logout: leaving Neo does not terminate
an already-issued Studio session. Local Studio logout remains available. A shared domain or a
password manager's suggestions alone do not supply this identity protocol.

Both sides are disabled by default. `make collab-sso-config` prepares only dedicated private env
values and before-images; it does not read password tables or restart Neo. Merge/deploy the
companion Neo PR using its normal tooling, then deploy Studio. See the deployment guide.

## Security and initial feature boundaries

Local recovery passwords use salted scrypt (N=2^17, r=8, p=1, 15-character minimum), bounded async
hashing and throttled login. Opaque session tokens are stored hashed with 12-hour absolute and
two-hour idle expiry. Secure/HttpOnly host-only cookies, exact-Origin checks and session CSRF
protect mutations. Static assets and authenticated PDFs have explicit route/path boundaries.

Hosted RPCs have a separate allowlist. Contributors draft/evaluate/comment; reviewers/admins may
publish reviewed source and approve references. Unknown desktop methods, arbitrary filesystem
paths, parser-lab, external agents and recovery writes remain denied. The Navarro website
is served through authenticated, allowlisted routes with exact dataset/iframe identity checks.
The selected engine/repositories are trusted Python, not a sandbox for arbitrary contributor
repositories. The process remains non-root and receives no SSH credentials.

`COLLAB_AI_ENABLED=1` enables the existing bounded Codex analysis, translation and grammar-repair
services for invited accounts. AI submissions and acceptance honor passage claims; accepted
candidates use PostgreSQL transactions, attributed revisions and durable idempotent receipts.
Only administrators change the shared model configuration. Grammar repair deliberately writes
only the selected engine through its existing hash-checked tools/receipts; it never publishes Git
or approves ground truth. Idle dependency maintenance waits for active AI jobs. Dirty grammar
changes defer upstream fast-forward updates until reviewed.

Deployment can install the maintainer's local `~/.codex/auth.json` over SSH in
`config/codex`, mounted privately as the container's Codex home. Normal deployments preserve
refreshed server credentials; `make collab-codex-auth` explicitly replaces them. Credentials are
never copied into an image, browser response, research export or Git. Private full backups include
them. The personal-key vault does not enable another provider. This is a shared maintainer-funded
Codex connection, not account-specific provider billing. See
[official headless authentication guidance](https://learn.chatgpt.com/docs/auth).

## References and validation

Primary references: [OWASP OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html),
[password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[transactions in node-postgres](https://node-postgres.com/features/transactions),
[Git worktrees](https://git-scm.com/docs/git-worktree),
[MDN host-only cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
[Caddy HTTPS](https://caddyserver.com/docs/automatic-https).

Tests cover PostgreSQL migrations/retention, CAS and concurrency, attribution, immutable snapshots,
crypto/authorization boundaries, actual Neo/Studio identity exchange, Git export safety and
restores. The clean-install workflow uses the exact documented Make/SSH path on a disposable
host with real Docker/PostgreSQL/Caddy, not production credentials. Browser tests separately run
both the transport fixture and actual compiled React/Python editor. Consult actual CI results;
these are not a security audit, real-mail-deliverability guarantee or linguistic certification.

### Fast Git contribution export

`make collab-publish-all` captures each repository's saved source bytes without
maintenance, a restart or waiting for active repairs. This snapshot does not
certify that an ongoing repair has finished. Only allowlisted files are committed;
excluded notes stay in the workspace. Explicit `collab-changes` / `collab-publish
REVIEW_SHA=...` reject changed review snapshots, including executable-mode changes.

Capture verifies the saved bytes against its manifest and fails promptly if they
move. A private index preserves the live sparse-checkout flags and commits exactly
the captured bytes; subsequent working edits are retained. Competing Git writes
fail immediately. The ref update checks the expected old commit, with rollback
and a private recovery receipt for index-installation failures. No checkout or
reset touches live source. Deployment still uses its separate drain lease.

Upstream reconciliation occurs in the private laptop checkout. The bundle excludes
objects reachable from the captured upstream
base. A private partial Git cache under `backups/publication-cache/` holds base
commit/tree metadata; sparse grammar checkouts lazily fetch needed files and
avoid historical scans/assets. Keep that cache while using exported checkouts,
which borrow its objects. Delta bundles require their recorded upstream base;
they are contributions, not standalone full-repository backups.

A first cache fill and GitHub operations still depend on network latency. Active
repairs continue during capture; a concurrent save can require rerunning capture.
The separate post-merge `collab-sync`/idle updater retains its synchronization rules.
