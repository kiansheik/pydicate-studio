# Claude Code with each contributor's own subscription

## Why it works this way

Anthropic's [Claude Code legal and compliance
policy](https://code.claude.com/docs/en/legal-and-compliance) draws one line
that decides this whole design:

> Anthropic does not permit third-party developers to offer Claude.ai login into
> their own applications, or to route requests through Free, Pro, or Max plan
> credentials on behalf of their users. Moreover, developers may not collect,
> store, or intermediate Claude.ai credentials or session tokens — sign-in to a
> Claude account must complete through Anthropic's own flow.

So Studio must not implement a "sign in with Claude" OAuth client, must not hold
an access or refresh token, and must not call Claude with one contributor's
subscription on another's behalf. The same page carves out the arrangement this
feature does use:

> Nor does it prevent an end user from signing in to the unmodified Claude Code
> binary with their own Claude subscription, including where a platform hosts
> Claude Code.

That carve-out comes with conditions: the binary is installed and run exactly as
published, none of its authentication methods are removed or restricted, and
each contributor's usage bills to their own agreement with Anthropic. Running
Claude Code inside Studio therefore also requires agreeing to Anthropic's
[Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms).

## The flow

`server/claude-auth.cjs` drives the binary's own `claude auth` commands. Nothing
about the sign-in is reimplemented here: the PKCE challenge, the state, the
browser page and the token exchange are all the binary's.

1. **Start** — `POST /api/claude-auth/start` spawns
   `claude auth login --claudeai` with `CLAUDE_CONFIG_DIR` and `HOME` pointing
   at that contributor's private directory, reads the authorization URL the
   binary prints, and returns it. The child stays alive, waiting on stdin at its
   `Paste code here if prompted` prompt, for at most ten minutes.
2. **Sign in** — the contributor opens that URL in their own browser and signs
   in to Anthropic. Anthropic shows them a one-time authorization code; this is
   the documented flow for a Claude Code process whose local callback the
   browser cannot reach, as in a container.
3. **Finish** — `POST /api/claude-auth/code` writes the pasted code to the
   waiting child's stdin and nowhere else. The binary performs the exchange and
   writes its own credential file inside its own configuration directory.
4. **Report** — sign-in state is whatever `claude auth status --json` says. The
   server parses that JSON; it never opens the credential file.

`POST /api/claude-auth/logout` runs `claude auth logout`, and `GET
/api/claude-auth` reports the current state. The collaboration panel's
**Claude Code · minha conta** section is the interface for all four.

## What Studio deliberately never does

- **Never reads the credential.** No code path opens `.credentials.json` or the
  macOS keychain. "Signed in" is a report from the binary, not an inspection.
- **Never stores the pasted code.** It goes to the child's stdin and is not
  logged, echoed in an error, persisted, or included in any response.
- **Never lets another credential stand in for the sign-in.** The child's
  environment has `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_PROFILE` removed, so the
  [precedence order](https://code.claude.com/docs/en/authentication#authentication-precedence)
  cannot silently select a server-wide credential instead of the contributor's.
- **Never backs the credential up or exports it.** The per-contributor homes
  live in `<deployment root>/credentials/claude`, outside `data/`, `workspace/`
  and `config/` — the only three directories the full checkpoint, the restore
  and the research export walk. A credential cannot leave the server inside a
  backup that someone later downloads.
- **Never shares one sign-in between accounts.** Each directory is named by a
  SHA-256 of the account id, created `0700`, and selected from the authenticated
  session — never from a request parameter.

## Where the credential lives

| Runtime | Directory |
| --- | --- |
| Hosted container | `/claude-homes/<sha256(account)>`, bind-mounted from `<deployment root>/credentials/claude` |
| Local server | `COLLAB_CLAUDE_HOME`, else `~/.local/share/pydicate-studio-claude` |

`deploy/collab/Dockerfile` installs the published `@anthropic-ai/claude-code`
package unmodified and sets `DISABLE_AUTOUPDATER=1`, so the binary in a release
is the one that was built and reviewed, not one that rewrote itself later.

## Still to build

Sign-in is only the credential half. Running translations and grammar
corrections under a contributor's own login still needs the job runtime: the
existing scoped `studio_authoring` MCP gateway
(`runtime/studio-mcp-gateway.cjs`) reached over stdio with
`--strict-mcp-config`, a tool allowlist that matches what Codex may do today,
the hash-guarded grammar-edit grant, and the hosted queue in `server/ai.cjs`,
which currently accepts `codex` only. Until that lands, signing in stores a
credential the runtime does not yet use.
