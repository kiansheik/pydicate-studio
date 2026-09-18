# Codex tool transport repair

## Goal

Fix the user's actual `Nhemöabaré.` analysis failing with `code-mode host is disabled` and no available Studio authoring tools, without using another paid model request.

## Files inspected

Required agent docs; saved project analysis records (read-only); `electron/provider-{codex,rpc}.cjs`, agent runner, scoped gateway/service and provider/MCP tests; installed Codex0.153.4 generated protocol schemas and cached `gpt-5.6-terra` metadata; provider and MCP guides. Official [App Server reference](https://learn.chatgpt.com/docs/app-server) documents thread-scoped MCP inventory and calls. The exact model mode/host behavior was established from installed metadata and the executable, not inferred from generic documentation.

## Files changed

`electron/provider-codex.cjs`, `electron/studio-mcp-gateway.cjs`, their focused tests, `src/domain/analysis.ts`, new `scripts/check-codex-tools.mjs`, `package.json`, README, provider/MCP guides, current state/log and this handoff. Earlier uncommitted work preserved.

## Findings and fixes

The saved attempt completed with zero tool steps and the reported host error; it was incorrectly a contributor `needs-input` outcome rather than configuration failure. Installed model metadata declares `tool_mode: code_mode_only`. Disabling feature preference does not disable the model's required execution mode; disabling its host makes `functions.exec` fail. The host is now enabled explicitly in both CLI startup and thread config, while shell, file/web access and unrelated connectors remain independently disabled. Code mode is the isolated JavaScript broker for allowed tools, not a filesystem/shell capability.

An actual no-generation `mcpServerStatus/list` probe found only eight tools: Codex0.153.4 did not follow the gateway's next discovery page. Evaluation, candidate inspection and proposal were missing. The small15-tool catalog now appears in the first response; large research/results remain paginated/lazy.

Before any `turn/start`, the adapter checks thread-scoped inventory, connection status and exact allowed tool names. Missing/partial/foreign tools produce `MCP_UNAVAILABLE`, which existing queue logic marks blocked. No paid request is made in that case. The renderer labels this phase in Portuguese. Existing completed requests stay untouched; resubmission is explicit after restarting the desktop main process.

## Commands run

- `codex --version`:0.153.4; `codex features list` and cached model metadata inspected.
- `node /tmp/studio-codex-tools-probe.cjs`: actual initialize/thread/start/inventory plus guide call, no model turn; reproduced eight-tool catalog before gateway fix.
- `npm run test:codex-tools` / `node scripts/check-codex-tools.mjs`: three deterministic installed-CLI cases pass. Disabled host: two loopback fixture responses, zero Studio calls, exact host error. Incomplete catalog: zero model requests/calls, explicit preflight failure. Fixed host: two loopback fixture responses and four actual code-mode/MCP calls (guide/create/evaluate/propose), with matching progress events. All cases have zero paid requests.
- `node --test electron/tests/agent-runner.test.cjs electron/tests/providers.test.cjs electron/tests/studio-mcp.test.cjs`:78/78 pass; includes missing/partial/failed/foreign inventory preventing `turn/start`, complete first-page discovery and actual local Navarro/evaluator access. Log `/tmp/studio-codex-fix-tests.log`.
- `npm run build`: passes typecheck and production build; existing bundle-size advisory only. Log `/tmp/studio-codex-fix-build.log`.
- Focused Prettier and `git diff --check`: pass.

## What worked

The permanent regression uses isolated Codex homes, loopback-only provider overrides, deterministic Responses SSE and temporary gateway callbacks. It executes the real installed code-mode host instead of stubbing its notifications, so it reproduces the missed integration boundary. It needs installed cached model metadata but no account credentials. Test scopes/listeners/profiles close after each run. Original corpus/reference hashes were unchanged in the actual-engine MCP regression.

## What failed

Earlier startup-only verification proved the MCP connection existed but did not prove the model's tool broker worked or the entire catalog was visible. The first disposable fake endpoint also assumed ordinary `tools` instead of Responses-lite `additional_tools` and failed; the final script handles installed wire behavior and tests an actual custom `functions.exec` call. No failed experiment called a paid model endpoint.

## Remaining questions

No live model retry or linguistic-quality experiment was run. Restart Studio's main process (stop the desktop command, then `make desktop`) before explicitly sending the preserved passage again. The installed code-mode path is verified; future model/CLI changes may require updating this opt-in transport regression. No profile migration, user draft rewrite, commit or push.

## Suggested next prompt

Try the preserved passage after restarting and report the actual candidate or tool error. Keep routine checks on the deterministic local transport rather than paid generation.
