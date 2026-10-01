# Accounts and provider authentication

Browser accounts are invitation-based. Local Studio accounts use their own
password and reset flow; optional Neo SSO uses a separately configured issuer,
client secret and verified Neo identity. Invite, reset and session controls remain
server-side; contributors never need Git, Python or provider credentials to edit.
See the [browser guide](collab-contributor.md) for the actual login flow and
[deployment configuration](../deploy/collab/README.md) for SMTP and SSO setup.

Administrators bootstrap the first account with `npm run collab:admin -- bootstrap`
plus `--email` and `--name`. The CLI prompts securely for its password. Subsequent
roles and invitations are managed through the authenticated collaboration panel.
Do not place real secrets in examples, commits or browser query parameters.

Hosted AI is explicitly enabled by `COLLAB_AI_ENABLED=1`. Codex uses the server's
configured CLI App Server account; its protected login cache transfer is an
administrator operation (`make collab-codex-auth`). Claude Code sign-in uses each
contributor's private server home and the unmodified CLI. These per-account homes
are separate from shared research backups/exports. Source contributions remain
usable without AI. Provider connection checks are distinct from paid generation.

The browser never receives raw provider secrets or arbitrary filesystem access.
Server method/capability allowlists and per-request identity remain authoritative.
Invoked analysis changes scratch proposals or checked grammar scope; it cannot
silently publish source or approve references. Historical authentication probe
reports record their original boundary and are not current login guarantees.
