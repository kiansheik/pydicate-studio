# Direct ground-truth review

## Goal

Put **Commit to Ground Truth** beside **Verificar** and **Salvar rascunho**, open the existing reference flow directly and remove its redundant confirmation checkbox.

## Files inspected

- Required agent index, current state, repository map and open questions.
- `src/App.tsx`, `src/components/GroundTruthPanel.tsx`, `src/useStudio.ts`, `src/workbench.css`.
- `tests/ground-truth.spec.ts`, `tests/next-hook-harness.tsx`, `tests/source-review.spec.ts`, `tests/next-passage.spec.ts`, `tests/authoring-sync.spec.ts`, `playwright.config.ts`, `package.json`.
- Affected ground-truth/source-review entry paths in `scripts/smoke-next.mjs` and `scripts/critic-persistence.mjs`.

## Files changed

- `src/App.tsx`: footer and Review entry open one shared modal; required source review closes it before ordinary source preview.
- `src/components/GroundTruthPanel.tsx`: native dialog wrapper, close controls, no confirmation checkbox, one explicit final save and duplicate-success guard.
- `src/workbench.css`: modal and footer layout.
- `tests/ground-truth.spec.ts`: direct App opening/cancellation and existing approval lifecycle adapted to one final action.
- `scripts/smoke-next.mjs`: current modal entry and no-checkbox approval path; broad smoke was not run.
- `docs/agent/current-state.md`, `docs/agent/log.md`, this handoff.

## Commands run

- Targeted `rg`, `sed`, `cat` and `git diff` inspection.
- `npx prettier --write tests/ground-truth.spec.ts` — passed.
- `npm run test:e2e -- tests/ground-truth.spec.ts` — 2 passed in 3.6 seconds after scoped escalation allowed the local Vite listener.
- `npm run build` — passes after final modal styling and combined inline-argument implementation; only the existing bundle-size advisory remains.
- `node /tmp/pydicate-ground-truth-view.mjs` — temporary local browser check, zero approval requests.

## What worked

The real App opens the reference dialog from the footer without changing analysis mode, and Revisão opens the same single modal. Delayed/unavailable status disables save. Cancelar, Escape and X close cleanly even when an earlier status request completes later; no source preview/apply or reference approval is sent. No checkbox remains. Dirty raw code and human fields block approval. Existing simulated failure/retry, concurrent duplicate rejection, preserved draft state and isolated successful approval checks pass.

Temporary visual evidence: `/tmp/pydicate-ground-truth-footer.png` and `/tmp/pydicate-ground-truth-modal.png`. The modal and footer were visually inspected. Tests call no AI provider and write no historical corpus files.

## What failed

The first browser run could not bind `127.0.0.1:5173` inside the restricted sandbox (`EPERM`). Scoped automatic approval permitted the same focused test; both cases then passed. No functional test failure remains.

## Remaining questions

No blocker for this request. This change did not rerun the broad native smoke or real corpus approval; the approval backend is unchanged and browser tests explicitly simulate it. Both ground-truth checks also pass in the combined 52-scenario run described in the [inline argument handoff](2026-09-17-inline-call-arguments.md).

## Suggested next prompt

Continue contributor feedback on the tree editor while preserving the direct ground-truth modal and single explicit save.
