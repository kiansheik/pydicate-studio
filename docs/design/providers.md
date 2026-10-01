# Provider runtime

The collaborative server owns provider adapters and durable jobs; the browser
receives status, streamed results and authorized commands. Hosted providers are
Codex and per-contributor Claude Code. A server-wide Claude Messages API key is
not exposed through the hosted allowlist. Shared runtime adapters and historical
request readers remain for compatible saved records and deterministic tests.

See [authentication](../authentication.md), [agent provider contract](ai-agent-providers.md)
and [MCP transport](mcp-agent-guide.md). Model configuration, scopes, cancellation,
steering and acceptance remain bound to the requesting user/job/revision.
Acceptance updates a draft; it never grants source or reference approval.

Ordinary runtime/server/browser tests use simulated transports with no paid
generation. `npm run test:codex-tools` verifies installed code-mode/MCP against a
local fake endpoint. `scripts/provider-smoke.cjs` is a separate explicit provider
probe and can consume usage; it is not part of routine checks. Historical probe
results are evidence only for their recorded accounts, versions and boundaries.
