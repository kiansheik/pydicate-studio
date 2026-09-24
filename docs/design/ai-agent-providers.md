# Iterative provider contract

`electron/agent-runner.cjs` exports `runAgent({provider, providers?, workingDirectory?, model, reasoningEffort, input, messages?, checkpoint?, images?, tools, callTool, mcp?, signal, budgets, onEvent, onCheckpoint})`. The existing provider `run` methods and legacy AI histories remain available. Credentials never enter renderer state.

`provider` is `codex` or `claude`; injected adapters support deterministic tests. Tools use MCP names/descriptions/input schemas. The direct Claude callback is `callTool(name,args,{signal,operationId})`. Codex calls the owner's authenticated scoped MCP shim; the owner enforces the same whitelist, revision, cancellation, budget and idempotency checks before each operation. No source publisher, reference approver, global setting, filesystem or arbitrary interpreter tool is exposed.

Events contain public text, request/response lifecycle, usage and validated tool names/arguments/results. Awaited checkpoints record input digest, messages, tool-call ledger, step/round counts, usage and pending phase. Neither adapter requests or persists private reasoning. The owner commits each checkpoint/event before more direct tool work. A failed persistence callback stops execution. Ambiguous provider acknowledgements require explicit retry; no exactly-once inference/billing claim is made.

The built-in strategy inspects guide/context, searches full dictionary senses and constructions, builds and evaluates constituents, compares preserved source/targets and proposes supported alternatives or asks a focused question. It treats source translation as independent interpretation and generated-analysis translation as an explanation of that expression, not proof of source fit. String equality never establishes linguistic correctness. Unsupported assertions remain hypotheses. Model rationale must stay short and evidence-based.

## Explicit continuation

`analysis_resume` (with the compatible `analysis_retry` alias) accepts paused,
failed, cancelled and needs-input jobs. It preserves the frozen input and the
same job/conversation/candidates, accepts optional guidance, and starts a fresh
attempt budget. Saved protocol messages and completed tool receipts continue
the research; an interrupted tool without a confirmed receipt is reported as
uncertain instead of replayed. Restart recovery preserves visible partial text.
Revision-bound duplicate commands are idempotent; changed engine/source evidence
rejects continuation. Replying with new source material still creates a new
frozen-input submission. No continuation happens automatically.

## Translate the existing tree

The direct translator uses `ai_start(action: "translate")` with
`context.targetLanguage` (default `Português`, at most 80 characters).
`ai_prompt_preview` accepts the same current expression/scope/revision and
returns `{prompt, targetLanguage, analysisTarget, inputHash}` without inference
or a request-history write. Both paths freshly evaluate the source as supplied;
they do not start the iterative analysis tools or import upstream corpus MCP
context. Prompts project the target, nested meaning hierarchy and relevant human
context without old translations or duplicate runtime trees.

Whole-tree scope ignores a navigation selection. Constituent scope evaluates
that exact source separately and labels whole-passage morphology as contextual
evidence, so the two cannot be mistaken for the same target. The response
translation uses the requested language; rationale/ambiguity explanations remain
Portuguese. Translation responses cannot apply an expression edit. Human review
must explicitly adopt a translation, bound to current draft revision and a
freshly checked engine fingerprint; stale results remain readable/copyable.

Saved general/occurrence notes are projected onto current source nodes, with
original definitions, explicit overrides and versioned contributor provenance.
Pending edits are saved before capture; changed relevant notes block translation
adoption. Analysis and explicit repair jobs freeze a private notebook snapshot,
reuse it on resume and reproject it onto candidates. Reconstruction withholds this
evidence. See [node interpretation contract](node-interpretations.md) for identity,
meaning precedence, privacy and size limits.

## Claude

The main process uses the existing `ANTHROPIC_API_KEY` / optional workspace configuration and official Messages endpoint. This is API-key authentication, not Claude Code login. Streamed content blocks and fragmented JSON arguments are assembled before tools run. Each tool result is placed immediately after its assistant call in the next request. Malformed arguments and unknown tools return structured errors; identical repeated call IDs reuse the saved result, while conflicting IDs stop the attempt. Truncated streams never execute incomplete arguments. Cancellation stops pending reads/new rounds and suppresses late results.

Upfront `images` and registered tool images become base64 image content, not JSON text or URL retrieval. Each job permits at most four initial images; MIME/size validation applies. An API rejection for unsupported image/model configuration remains an explicit preserved failure, allowing a subsequent text-only submission. Metadata alone never becomes an image claim. Complete checkpoints can be reconstructed without a provider-side conversation ID; feedback carries a new frozen input revision.

## Codex

Validated against installed `codex-cli 0.153.4`: generated normal and experimental app-server schemas and feature inventory. The scoped descriptor is `{name:'studio_authoring',command,args,env:{STUDIO_MCP_SOCKET,STUDIO_MCP_TOKEN,ELECTRON_RUN_AS_NODE:'1'},toolNames}` from the owner gateway. Only its tool allowlist is enabled. Other configured MCPs, plugins/apps/hooks, shell/unified execution, browser/web, computer/image/file viewing, external skill discovery, subagents and memories are disabled at process/thread setup. Experimental thread parameters disable environment access and capability roots. Host approvals/elicitation are denied. The scratch owner remains the authority for every tool call.

The code-mode **host stays enabled** at process and thread setup. Installed `gpt-5.6-terra` metadata declares `tool_mode: code_mode_only`, which takes precedence over a disabled feature preference. Its JavaScript tool broker has no Node/filesystem/network APIs; disabling the host breaks access to the allowed MCP tools too. Full schema discovery is returned in one compact page because installed Codex imports only the first MCP discovery page. Before `turn/start`, the adapter checks the actual thread's `mcpServerStatus/list`: it must contain every expected Studio tool, be connected and expose no foreign tools. Failure becomes `MCP_UNAVAILABLE` without a generation request.

`config/read` contains redacted display values and must **not** be copied into a new thread configuration. Only other servers' enabled flags are overridden, and the fresh scoped transport is supplied. This was verified with actual installed app-server initialization and `thread/start` against a temporary Studio MCP socket; **no `turn/start` or generation request** was sent.

That earlier startup-only check missed the code-mode transport failure. `npm run test:codex-tools` now exercises the actual installed CLI against an isolated loopback fake Responses endpoint, with no credentials or paid requests. It reproduces the exact disabled-host error, verifies incomplete discovery rejects before inference, then executes guide/create/evaluate/propose through the real code-mode host, MCP shim and gateway. Scratch callbacks are deterministic fixtures; this checks transport, not linguistic usefulness. The local endpoint supplies two fixture responses per host case. All listeners, scopes and temporary profiles are closed afterward.

Ephemeral threads are not durable continuity. Each new attempt reconstructs preserved public conversation and tool evidence. MCP tool start/completion notifications produce public progress and checkpoint records; reasoning items are ignored. Native/foreign tool events fail the attempt. Duplicate completion events are harmless; mismatched call IDs and incomplete tool streams fail explicitly.

Default budgets are 32 tool steps, 33 Claude rounds, 4,096 output tokens and 300 seconds, with finite validated upper limits. Claude gets the remaining token budget on each request. Installed Codex app-server has no supported hard `max_output_tokens` turn field: the owner enforces tool limits and cancellation, while the adapter stops on observed usage/text ceilings and wall deadline. Notification timing means this is not an exact billed-token cap.

## Evidence and verification

### Explicit grammar corrections

`grammar-repair` is a distinct Codex job with its own frozen expression, desired form, notes and corpus baseline. It receives only `grammar_context`, `grammar_files`, `grammar_read`, `grammar_edit`, `render_candidate` and `reload_engine`; the ordinary scratch tools remain unchanged. The same read-only Codex process and scoped MCP transport are used. No shell, general filesystem writer or external provider is enabled.

The main process resolves the selected project grammar directory. Existing Python files under `pydicate/`, `tupi/` and `tests/`, plus named grammar notes, can be read. Edits exclude `AGENTS.md`, require the current SHA-256 and a unique exact excerpt, persist a before-image receipt, and automatically refresh Studio and compare the original expression and corpus. Symlinks, hardlinks, traversal and unknown tools fail before a write. Failed intermediate evaluation preserves the edit receipt so the same job can repair it. Final verification is also run by the owner after provider completion. Follow-ups retain the original target and baseline; other conversations can run concurrently, but repairs on one directory are serialized.

Official documentation inspected during implementation:

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Claude streaming protocol](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Claude tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)

`node --test electron/tests/agent-runner.test.cjs electron/tests/providers.test.cjs electron/tests/evidence-images.test.cjs` passes 73 checks, including existing provider/history regressions. New deterministic cases cover multiple tool rounds, full definitions, images, malformed arguments, unknown tools, repeated IDs, partial streams, cancellation, budgets, checkpoint continuation and feedback. Pixel tests check asymmetric colored landmarks under 16 intrinsic/view rotation and zero/nonzero page-origin combinations, dimensions, byte limits, saved hashes, corruption and text-only operation. `@napi-rs/canvas` is pinned directly to `0.1.100`; PDF.js remains `5.4.624`.

Routine tests perform no provider inference. Protocol correctness and deterministic evidence do not establish autonomous linguistic usefulness; that requires a separately authorized budgeted live experiment.
