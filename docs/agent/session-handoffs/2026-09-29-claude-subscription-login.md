# Claude Code sign-in with each contributor's own subscription

## Goal

Replace the Claude API-key field in the AI section with a sign-in a contributor
starts by clicking a link, so the server can run Claude Code for them with
per-account credentials that last until Anthropic expires them.

## What the request could not be

The asked-for design — Studio runs the OAuth flow, keeps the returned token and
calls Claude with it — is the one arrangement Anthropic's
[Claude Code policy](https://code.claude.com/docs/en/legal-and-compliance)
prohibits: no third-party Claude.ai login, no routing requests through Free/Pro/
Max credentials on behalf of users, and no collecting, storing or intermediating
Claude.ai credentials or session tokens. `CLAUDE_CODE_OAUTH_TOKEN` does not
change that; `claude setup-token` is for a subscriber's own CI.

The same page permits an end user signing in to the **unmodified Claude Code
binary** with their own subscription on a platform that hosts it, provided the
binary is unmodified, its auth methods are intact, and usage bills to that user.
The user chose that route after seeing both. It requires agreeing to Anthropic's
Commercial Terms of Service before the feature is used in production.

## Files changed

- `server/claude-auth.cjs` (new): drives `claude auth login --claudeai`,
  `auth status --json` and `auth logout` per account. Reads the authorization
  URL from the binary's output (stripping OSC 8/CSI escapes), holds the child at
  its stdin prompt for ten minutes, and writes the pasted code to that stdin
  only. Scrubs `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_PROFILE` from the child environment
  so credential precedence cannot substitute a server-wide credential.
- `server/http.cjs`: `GET /api/claude-auth`, `POST /api/claude-auth/start`,
  `/code`, `/logout`, all session-scoped, CSRF-checked and rate-limited.
- `server/config.cjs`: `claudeHomeDirectory` from `COLLAB_CLAUDE_HOME`.
- `server/public/panel.js`: the **Claude Code · minha conta** section — connect,
  open link, paste code,status line, sign out.
- `deploy/collab/Dockerfile`: installs published `@anthropic-ai/claude-code`
  2.1.236 unmodified; `DISABLE_AUTOUPDATER=1` keeps a release reproducible.
- `deploy/collab/compose.yml`, `scripts/collab/host.py`: per-contributor homes
  at `<root>/credentials/claude` → `/claude-homes`, deliberately outside the
  `data/`, `workspace/` and `config/` trees that backup, restore and research
  export walk, so a credential cannot leave inside a downloaded backup.
- `server/tests/claude-stub.cjs` (new), `server/tests/claude-auth.test.cjs`
  (new), `server/tests/http.test.cjs`: a stub binary with the real one's
  arguments and printed shapes, including the OSC 8 link and the stdin prompt.
- `docs/design/claude-subscription-login.md` (new): the policy basis, the flow,
  and the explicit list of what Studio never touches.

## Commands and results

- `node --test server/tests/claude-auth.test.cjs`: 2 passed. Covers sign-in,
  rejection, expiry, invalid codes, a missing binary, an unconfigured home, and
  a filesystem sweep asserting that neither the pasted code nor the stored
  credential appears anywhere outside the binary's own directory.
- Full hosted suite with disposable PostgreSQL on port 56544: 67 passed,
  8 conditional skips, 0 failures — including the new HTTP-level flow in
  `http.test.cjs` (unauthenticated 401, start, rejected code, sign-in, status,
  sign-out, and no credential in any response body).
- Real-binary check against installed Claude Code 2.1.236, without completing a
  login: `status` reports `none` even with `ANTHROPIC_API_KEY` present in the
  parent environment, `start` returns the genuine
  `claude.com/cai/oauth/authorize` URL with `client_id` and `code_challenge`
  and no terminal escapes, a wrong code is rejected, and the account stays
  signed out. No credential was created.
- `npm run format:check` passes.

## What is not done

The runtime half. `server/ai.cjs` still accepts `codex` only; nothing yet runs
`claude` against the scoped `studio_authoring` MCP gateway, the tool allowlist,
or the hash-guarded grammar-edit grant. Signing in today stores a credential the
job queue does not use.

## Remaining questions

Whether Anthropic considers this hosted arrangement acceptable for this specific
deployment is a question for Anthropic, not an inference from the docs: agree to
the Commercial Terms, and contact sales if the deployment is in doubt. The
expiry behaviour of a subscription login inside a long-lived container is
untested here; `claude auth status` is the only supported signal and the panel
surfaces it as-is.

## Suggested next prompt

Wire the Claude runtime: run the unmodified binary per job with
`--strict-mcp-config` against `electron/studio-mcp-stdio.cjs`, mirror the Codex
tool allowlist and grammar-edit grant, and extend `server/ai.cjs` to accept the
provider for contributors who are signed in.
