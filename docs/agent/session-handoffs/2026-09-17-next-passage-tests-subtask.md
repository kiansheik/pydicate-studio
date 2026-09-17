# Next-passage verification subtask

Goal: exercise the primary one-click pending-passage workspace, cumulative locators, restart, ordinary undo and reviewed source migration.

Inspected: `App`, `SourcePane`, `useStudio`, `next-page`, draft types/validation, existing authoring harness/specs and desktop persistence tests.

Changed: optional real App `?workspace` mode in `tests/next-hook-harness.tsx`; new `tests/next-passage.spec.ts`, `src/domain/next-page.test.ts`, and `electron/tests/pending-validation.test.cjs`. The simulated bridge persists selection and supplies deterministic evidence/source-preview responses. It is not a linguistic engine or corpus writer.

Verification: `npx tsc -b` passed; four next-page domain cases passed; two desktop pending validation/persistence cases passed; all three new browser scenarios passed across focused runs. The browser scenarios verify the ordinary App shell, empty canvas/source fields, same-page last-edited locators, mapped predecessor evidence identity, successive pending lines, reading-field undo/redo, selected-shell restart, revision-bound previews and exact draft/loose-piece migration after explicit simulated apply. An initial exact-label test selector included controlled textarea contents after redo; switching to the textbox's accessible name fixed the assertion. The underlying undo/redo state was correct.

Commands: `npx vitest run src/domain/next-page.test.ts`; `node --test electron/tests/pending-validation.test.cjs`; `npx playwright test tests/next-passage.spec.ts --output=test-results/next-passage`; focused rerun with `--grep 'repeated pending passages'`; targeted formatting and whitespace checks.

Remaining: root owns native production verification, combined docs/current-state/log and final handoff. No AI calls, source/reference changes, neighboring edits, commit or push.

Follow-up: one additional focused hook case (`--grep 'later pending line cannot publish'`) passed. A later pending line rejects preview before any bridge RPC, preserving both live and saved drafts; selecting the first pending line still previews successfully with its reserved permanent identity. Four next-passage browser scenarios have now passed overall.

Suggested next prompt: use the new-line button repeatedly in the actual Araújo workspace and report any mismatch between section inheritance, PDF guidance and the selected line after restart.
