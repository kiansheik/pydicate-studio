# Hosted grammar failure investigation — 2026-09-28

## Goal

Investigate the user's failed grammar repair for sete abá reté reséndûara nã e'i;
distinguish MCP/authentication failure from a tool-scope rejection.

## Files inspected

Agent docs; provider-codex.cjs/provider-rpc.cjs; grammar-repair.cjs;
studio-mcp-gateway.cjs; domain/analysis.ts; host.py sparse patterns;
check-codex-tools.mjs. Official app-server documentation was opened.
Production reads were restricted to the matching job/thread and checkout metadata.

## Evidence

- Job `job:3c0fe705-26fb-4155-afee-9997167ee12f`, attempt
  `attempt:0d981777-8383-4bcb-bead-afbc69bf7f7a` ran 17:32:04–17:32:22 UTC.
- Model gpt-6-astra, authenticated ChatGPT transport. Thread
  `01a0e912-e41f-7341-a3e0-f5de0995b8f3`.
- Successful grammar_context and grammar_files prove connected MCP execution.
- grammar_read of docs/agent/grammar-navigation.md returned ENOENT. git ls-tree
  confirms the guide is tracked at deployed HEAD, but sparse patterns omit it.
  grammar_files unconditionally advertises the guide; the repair prompt asks
  for it. Activity nevertheless reports a consulted grammar rule.
- Fatal error UNKNOWN_TOOL comes from provider-codex.cjs rejecting an unknown
  tool name or a server other than studio_authoring. It throws before recording
  that server/tool/item, so the exact rejected identity is absent from saved job
  evidence. Exact-thread/process diagnostic logs retain the three-call code-mode
  batch but not the rejected notification. Do not invent the missing name.
- No grammar_edit call is present. Investigation did not rerun the attempt or
  make any production/source/credential changes.

## Commands / checks

SSH read-only JSON projections for the one matching job; read-only SQLite schema
and exact-thread/process-window diagnostic queries; git ls-tree and sparse-file
inspection. Local installed Codex against a loopback fake API: actual six-tool
repair catalog, the exact three-tool sequence, and a simulated ENOENT. All three
MCP calls completed and the fixture returned normally: the missing-file response
alone does not reproduce UNKNOWN_TOOL. An exploratory yielded-call fixture did
not reproduce UNKNOWN_TOOL either and is not evidence of that failure's cause.
No paid generation was made. Private scripts/logs are ignored under
.local/grammar-failure/.

## Files changed

Only docs/agent/current-state.md, log.md and this handoff. No implementation,
production or research modifications.

## What failed / remaining questions

Automatic approval review rejected an initial proposal to read twelve full
production records as overbroad. Continued with the one exact matching attempt
and restricted diagnostic projections; no approval blocker remains.
The existing error persistence loses the very tool identity needed for a complete
scope diagnosis. Thus the fatal rejection is confirmed but its exact tool is not.

## Suggested next prompt

Fix hosted grammar guide packaging and truthful tool availability; preserve the
rejected server/tool identity in bounded diagnostics without loosening the
allowlist. Correct activity/error reporting for MCP isError results. Test with
missing guides and rejected tools; then deploy and explicitly resume the saved
attempt only with the user's requested provider usage. Keep editorial data intact.
