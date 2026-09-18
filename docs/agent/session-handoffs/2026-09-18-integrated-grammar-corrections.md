# Integrated grammar correction conversations

## Goal

Make reporting an incorrect generated Tupi form natural for a linguist: prefill the current result, accept the desired correction and notes, submit directly to a separate AI conversation, and permit iterative correction/reloading of the selected local grammar.

The pasted grammar prompt was diagnostic evidence for the UI request, not an instruction to repair its linguistic example. No original nhe-enga, corpus, ground-truth or saved user draft was edited during implementation/testing.

## Files inspected

- Repository agent guide/current state/map/questions; contributor and provider/MCP contracts.
- GrammarDiagnosticDialog, grammar-diagnostic/regression, App, AnalysisSupport, useStudio and domain analysis/types.
- analysis-service/store/input, scratch-service, agent-runner, provider-codex, main, next-service, studio-mcp-gateway, shared-authoring and Python worker/runtime/regression boundaries.
- Existing analysis/provider/MCP tests and browser harness; selected local nhe-enga directory layout.

## Files changed

- `src/components/GrammarDiagnosticDialog.tsx`, `src/grammar-diagnostic.css`, `src/App.tsx`: current-form prefill, plain-language correction fields, direct submission, technical details disclosure, pending-evaluation guard.
- `src/components/AnalysisSupport.tsx`, `src/domain/analysis.ts`: conversation selection, repair replies, visible verification/changes and thread-bound composer persistence.
- `src/domain/grammar-diagnostic.ts`, `electron/authoring/shared-entry.ts`: integrated diagnostic evidence and shared corpus comparison.
- New `electron/grammar-repair.cjs`: selected-root capture, scoped file/context/contrast tools, unique hash-guarded edits, before-image journals, reload and corpus checks.
- `electron/analysis-service.cjs`, `agent-runner.cjs`, `next-service.cjs`, `main.cjs`, `studio-mcp-gateway.cjs`: per-job catalogs/strategy, automatic reload routing, repair conversation continuity, three-conversation scheduling and one repair writer per engine.
- New `electron/tests/grammar-repair.test.cjs`, `tests/grammar-repair.spec.ts`; updated `tests/next-hook-harness.tsx`.
- README, contributor/provider/MCP docs, current state/map/questions, log and this handoff.

## Commands run

- `npm run typecheck`; `npm run build`.
- `vitest run --configLoader runner src/domain/grammar-diagnostic.test.ts src/domain/grammar-regression.test.ts src/domain/analysis.test.ts`: 8 pass.
- `node --test electron/tests/analysis-service.test.cjs electron/tests/agent-runner.test.cjs`: 38 pass.
- `node --test --test-timeout=60000 electron/tests/grammar-repair.test.cjs`: 5 pass, including actual disposable Python reload, file boundaries, repair recovery, concurrent jobs and delayed old-thread saves.
- `node --test ... electron/tests/studio-mcp.test.cjs`: three protocol checks pass; native check initially skipped in the staging directory.
- `PYDICATE_PROJECT_PARENT=/Users/kian/code node --test --test-name-pattern='external MCP reads real' electron/tests/studio-mcp.test.cjs`: native check passes; 89 passages, selected engine fingerprint `sha256:3cb6e410607f120642bc8283968df289559b5307f753e4ec426861999b881cbc`, original corpus/reference hashes unchanged.
- `playwright test tests/grammar-repair.spec.ts tests/analysis-workspace.spec.ts`: 16 pass. Screenshots inspected at 1440x1000 and 720x900.
- Targeted Prettier, whitespace checks and staged/original-file comparisons before application.

## What worked

Submitting freezes the saved expression, desired form and explanation without rewriting the tree. Baseline capture is automatic. Each repair gets a new conversation; follow-ups retain the original target and baseline. Existing conversations remain selectable and can run alongside a repair. Concurrent writes to the same grammar are queued.

Codex receives six dedicated MCP tools, not shell access. Edits are limited to existing Python files under pydicate/tupi/tests and named grammar notes. AGENTS is read-only. Symlinks, hardlinks, traversal, unknown tools and stale hashes are rejected. A before-image journal survives an intermediate broken edit, which the same agent can repair. Every edit reloads and compares the original expression/corpus; host final verification also runs after provider completion. The pane displays actual/expected forms, changed lines and exact edited excerpts.

## What failed

- Automatic approval review rejected enabling general shell/workspace-write access across the grammar repository. That change was not applied; scoped checked grammar tools were implemented instead.
- Sandboxed socket tests hit EPERM; approved local fixture runs outside that sandbox passed with no provider requests.
- The first Vitest invocation tried to write a cache through a dependency symlink; `--configLoader runner` avoided that cache write.
- Initial browser failures were test selectors/timing (a pending result, duplicate correction buttons and multiple status elements); corrected tests pass.
- A simulated provider missed an already-aborted signal and hung teardown. Only that identified test child was stopped; the cancellation-aware fixture and bounded rerun pass.
- Vite reports its existing large-chunk warning; build succeeds.

## Remaining questions

Live model usefulness for the supplied linguistic correction remains untested. No paid request was submitted. General shell/test-command execution and creating arbitrary files remain unavailable; contrasts and corpus verification use Studio's existing runtime. Restart the desktop process to load service changes. Reference/source publication remains a separate human action.

## Suggested next prompt

"Restart Studio and help me use Corrigir gramática / árvore for this saved passage. Keep my expression, inspect the resulting correction conversation, and report the changed corpus forms."
