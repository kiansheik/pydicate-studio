# Optional collaboration server

## Scope and current boundary

Linux-hosted, invitation-only single-workspace mode for the existing Studio. Desktop launch,
Electron IPC and browser demo are unchanged. The HTTP entry point injects a named browser
transport before the existing compiled React entry, then calls the actual Node/Python services.
It does not emulate linguistic output. Start with `npm run collab`; Node 22.16+ is required
for this mode (the production template and CI use Node 24).

Implemented: individual passwords, invite/reset mail, contributor/reviewer/admin roles,
shared server autosave, per-passage reservations, live presence, threaded passage comments,
resolution/reopening, revision-history export, per-user activity reports and account revocation.
Contributors draft/evaluate/comment; only reviewers/admins can publish source changes or
approve references. A matching generated output still does not create editorial approval.

This is **not a CRDT or character-level Google Docs editor**. Independent passage edits merge
at persistence; competing saves on one passage return a conflict. Other people's saved drafts
become visible through **Carregar estado compartilhado**. That reload is explicit and warns
about unconfirmed local edits. Source changes use the existing source-refresh notifications.
The local recovery export is available after connection/session failures. Shared publication
can also conflict with pending-passage ordering changes; preserve/export and compare rather
than overwrite. Do not use simultaneous edits to the same tree as the pilot workflow.

Hosted paid AI, external agents, parser-lab processes, grammar repair, arbitrary project paths,
application updates, and recovery writes are deliberately unavailable. Desktop behavior is not
removed. Python dictionary searches and lexical construction remain available; the separate
`studio://dictionary` embedded website is not served on the authenticated web origin. Project
selection is server-owned. PDFs are uploaded by reviewers, then read/cropped by contributors.

There is no automatic GitHub merge, public registration, Pix processing, bounty entitlement,
project-per-user isolation, SSO with Neologismo, or automatic browser-tree merge in this mode.

## Data, concurrency and attribution

`server/store.cjs` owns SQLite schema v1 with WAL/FULL synchronization, parameterized statements,
account/session/token tables, shared drafts and tombstones, selections, expiring claims,
comments, editorial checkpoints and categorical audit events. A kernel `flock` ensures only
one server process owns the filesystem/Python services. Run one replica on local disk, not NFS.

Draft writes compare the version of **each changed passage**, not a whole-project revision.
The browser never adopts the version of unseen remote content. Claims are user-and-tab scoped,
last 120 seconds and renew on active heartbeats. They are not permissions to approve text.
A transaction validates the resulting envelope using the existing desktop schema and preserves
server-issued AI acceptance provenance. Failure rolls back the complete patch.

Server session identity supplies authorship; client user IDs and telemetry claims do not.
Consecutive autosaves by one author coalesce into 30-second editorial checkpoints, retaining
the first before-image and latest after-image. Revisions are not a keystroke recording or a
complete fine-grained undo log. They are retained separately from the 90-day usage log.
Comments/revisions are visible to every member of this one workspace. Usage reports and account
lists require admin role. Self-reported UI events have a distinct `browser` origin and are not
proof of payment, linguistic approval, or hours. No automatic payroll calculation is included.

The desktop draft envelope retains its existing 4 MiB / 5,000-draft limit. Plan an archive/shard
migration before approaching it. Managed uploads cap individual PDFs at 100 MiB and retained
originals at 250 MiB; the managed evidence service also keeps verified copies. Back up both.

## Authentication and web boundary

Passwords use salted asynchronous scrypt (`N=2^17,r=8,p=1`) with bounded hash concurrency and
15-character minimum. No plaintext passwords are stored. Sessions are random opaque tokens
stored as SHA-256 digests, with host-only Secure/HttpOnly/SameSite=Strict cookies, 12-hour absolute
and two-hour idle expiry. Password changes, reset and admin revocation invalidate sessions.
Invites expire after 48 hours; reset tokens after 30 minutes. Single-use tokens appear in URL
fragments rather than request paths/logs. Reset delivery is asynchronous and returns a generic
message, whether or not an address is registered.

Every authenticated mutation requires exact Origin and a session CSRF token. Login/reset also
require exact Origin and non-simple JSON. No cross-origin API access is enabled. CSP blocks
remote scripts, framing and evaluated strings. Static files have an explicit route and realpath
containment checks. PDF bytes require an authenticated session. Method allowlists are independent
of the desktop bridge: adding desktop functionality does not expose it automatically.

The selected corpus/grammar is trusted executable Python, not an untrusted-code sandbox.
Never accept uploaded repositories or install arbitrary helpers from contributors. Run as a
non-root isolated service with bounded memory/CPU/processes and no host credentials/SSH sockets.
SMTP/provider environment secrets are removed from the Python worker environment. Provider and
external-agent endpoints remain denied. The source publisher's existing byte guards still apply.

TLS terminates at the existing shared Caddy. `COLLAB_TRUST_PROXY=1` is safe only when the listener
is reachable exclusively through the trusted edge network. The rightmost forwarded address is
used only for throttling, never authorization. Do not publish the backend port publicly.

## SMTP and hosting integration

Use a new `studio.academiatupi.com` site so the existing apex application and
`api.academiatupi.com` remain unchanged. Deployment templates reuse the `caddy_edge` external
network identified in `kiansheik/neologismotupi/deploy/docker-compose.remote.yml` and its shared
xe-roka Caddy setup. They do not create another port-80/443 listener or modify those repositories.

Mail uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
`SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_USE_TLS` conventions, with optional `SMTP_USE_SSL`.
Choose authenticated STARTTLS directly, or the optional Compose overlay to reach the existing
private `smtp-relay` without exposing port 25. Discover the actual network before configuring it;
joining Neologismo's default network broadens network access, so a dedicated mail-only network
is preferable when you later isolate services. Never commit `.env` or log reset links.

## Research references

Reviewed 2026-09-26; implementation choices, not a claim of external security certification:
- OWASP [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): scrypt parameters as a no-extra-native-dependency alternative to preferred Argon2id.
- OWASP [sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [password reset](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- Node [SQLite API](https://nodejs.org/api/sqlite.html): single-process embedded persistence; do not horizontally scale this design.
- Caddy [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): existing TLS edge and event-stream flushing.

## Validation and release acceptance

Run `node --test server/tests/*.test.cjs`. Optional `COLLAB_REAL_PROJECT=/path/to/siblings`
runs the real Python adapter smoke. CI also builds the existing application and opens disposable
trusted public corpus/engine fixtures, records their commits, and checks tracked source integrity.
Tests use no paid model calls, production credentials, public mail or corpus publication.

Before production, use two invited accounts in staging to verify actual Araújo PDF geometry,
independent edits, same-passage conflict/recovery, source review permissions, email delivery,
password reset, logout/revocation, Caddy reconnect behavior and backup restoration. Measure memory
and latency with representative contributor sessions. Local unit/HTTP tests do not certify the
full production deployment or linguistic correctness.
