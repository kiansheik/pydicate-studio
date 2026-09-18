# Grammar repair loop

- Goal: bring the working VS Code Tupy grammar-correction prompt and corpus-first iteration into Studio.
- Files inspected: `vscodetupy/src/groundTruthStatus.ts`, Studio grammar diagnostic dialog/domain, `publication_regression.py`, `authoring_service.py`, worker/IPC allowlists, `oldtupicorpus/authoring/service.py` MCP reload behavior.
- Files changed: Studio diagnostic prompt/dialog/styles, canvas action label, new `grammar-regression.ts` and tests, read-only Python snapshot RPC and worker/IPC allowlists, agent docs.
- Commands run: real `grammar_regression` through `ProjectAdapter`; focused Vitest and Node worker tests; `npm run build`; Prettier and diff checks.
- Worked: snapshot evaluates 89 Araújo and 40 Bettendorff lines in a fresh engine process; browser code compares unchanged expressions across snapshots and separates approved-reference regressions from baseline mismatches. The dialog refreshes Studio and the selected tree after each engine edit. The prompt requires `reload_engine` in the long-lived MCP server before its next render.
- Failed: none in the focused checks. No live provider request or grammar edit was made for this feature.
- Remaining questions: a real contributor-driven engine change should exercise the full UI loop; the comparison is read-only and does not replace `verify_ground_truth`'s generated-record currency check. Baselines are session-scoped.
- Suggested next prompt: choose an attested grammar mismatch, capture a baseline in Studio, repair the selected engine after the prompt's approval checkpoint, refresh and inspect every changed source line.
