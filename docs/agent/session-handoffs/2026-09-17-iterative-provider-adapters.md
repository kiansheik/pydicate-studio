# Iterative provider adapters and source pixels

## Goal

Implement the provider-neutral tool loop while preserving legacy provider/history APIs; verify real source crops without inference usage.

## Files inspected

Required agent docs and pasted milestone; AI authoring contract; `provider-{codex,claude,rpc,service}.cjs`, provider tests; actual generated Codex0.153.4 schemas/feature inventory; scratch MCP descriptors; PDF service/fixture and `evidence-images.cjs`; official provider documentation linked in [provider contract](../../design/ai-agent-providers.md).

## Files changed

New `electron/agent-runner.cjs`, `electron/tests/agent-runner.test.cjs`, `electron/tests/evidence-images.test.cjs`; extended Codex/Claude adapters and strict JSONL error handling; formatted root-authored evidence image renderer; direct canvas dependency/lock pin; provider contract and this handoff. Main queue, scratch/MCP service and UI remain owned by parallel implementation agents.

Follow-up ownership: added `electron/tests/analysis-service.test.cjs` against the actual integrated service/store/shared builder and strict draft writer. The service implementation remained with root.

## Commands run

- `codex --version`, `codex features list`, `codex app-server generate-json-schema --out /tmp/pydicate-codex-schema`, same with `--experimental`.
- `node --test electron/tests/agent-runner.test.cjs electron/tests/providers.test.cjs electron/tests/evidence-images.test.cjs`: 73 checks pass.
- Final integrated run adds `electron/tests/analysis-service.test.cjs`: **84/84 pass**, after compact-list and current acceptance checks landed. The11 service cases cover immutable input and duplicate submission, source translation, evidence/draft capture races, batch/provider-unavailable behavior, strict draft CAS, real raw/shared-builder edits, proposal/acceptance/undo receipts, cancellation/late work, ambiguous restart with explicit retry, feedback cloning and interrupted acceptance-mirror recovery.
- Targeted `npx prettier --write` / `node --check` on changed provider/test files; `git diff --check` clean.
- `npm install --package-lock-only --offline --ignore-scripts`: minimal direct `@napi-rs/canvas`0.1.100 pin, offline audit reports no vulnerabilities in installed set.
- Actual installed Codex initialization + ephemeral `thread/start` with the real scoped MCP gateway, isolated temporary profile directory, **no model turn/generation**: succeeds with selected `gpt-5.6-terra`.

## What worked

Claude six-round streamed dictionary/builder/evaluation/proposal fixture with real image protocol blocks; schema guards, durable tool IDs, checkpoint resume and revision-bearing feedback. Codex scope config and public MCP progress/history reconstruction; cancellation and incomplete streams fail without success. All58 earlier provider/history regressions still pass. PDF image assertions cover16 rotation/origin combinations and correct native colored landmarks; capture, restart and checksum rejection pass. No corpus/neighbor mutations or provider generation.

## What failed and was fixed

Actual `config/read` output was not safely round-trippable: disabled Unity MCP duration appeared as an empty string and broke `thread/start`. Adapter now only overrides existing MCP enabled flags and supplies its own new scope. Default sandbox denied a temporary Unix listener (`EPERM`); scoped execution escalation was automatically approved, and the no-generation smoke passed. Resuming an interrupted idempotent tool initially consumed an extra step; it now retains the pending operation's original budget count. Legitimate explicit `constructor` schema fields are accepted while undeclared prototype keys remain rejected.

Integration review found that cloning a previous feedback candidate through `fromCandidateId` was rejected by current-job isolation. The authoring agent now permits only the exact frozen `input.feedback.candidate` snapshot, preserving evidence and allocating a new scratch identity/revision. The integrated feedback test confirms both branches survive. Root fixed the legacy empty-canvas fallback's extraneous version field and bounded list/detail separation. Missing Claude credentials now report `PROVIDER_AUTH` and process startup failures `PROVIDER_UNAVAILABLE`.

## Remaining questions

Codex installed schema has no hard per-turn output-token field; observed usage/text limits and deadline are documented stop controls, not billing guarantees. Unusual historical PDF fonts/codecs and budgeted live-provider linguistic usefulness remain separate from deterministic fixtures. Root must finish queue/UI/publication integration and critic rounds.

## Suggested next prompt

Exercise a budgeted local-source reconstruction from typed diplomatic text with withheld answer/reuse entries, inspect source/morpheme support and competing senses, and record human corrections separately from protocol success.
