# PDF guide subtask

Goal: show the preceding passage's PDF view and last box as a visual guide for a new pending line, while preserving independent evidence identities.

Inspected: agent guide/current-state/repo-map/open-questions, PDF contract, `PdfEvidence`, evidence domain/service/tests, evidence routing in `next-service`, existing PDF harness/spec, and SourcePane call sites.

Changed: `src/domain/evidence.ts` and tests, `src/components/PdfEvidence.tsx`, `src/evidence.css`, `electron/evidence-service.cjs` and tests, only the evidence-routing fallback in `electron/next-service.cjs`, `tests/pdf-harness.tsx`, `tests/pdf-evidence.spec.ts`, and `docs/design/pdf-evidence.md`.

Contract: `newPassageGuide` plus mapped `previousPassageId` enable a separate persisted `guide`; new `regions` remain empty. Previous unsaved locations, saved source history and repeated empty pending lines are supported. Guide-only saves do not emit source evidence pointers. The shadow has no region identity/handles/pointer events; a newly drawn box gets its own identity. Existing passage inheritance remains compatible.

Commands/results: `npx tsc -b` passed; `npx vitest run src/domain/evidence.test.ts` passed 5; `node --test electron/tests/evidence.test.cjs` passed 9; `npx playwright test tests/pdf-evidence.spec.ts` passed all 4 actual PDF.js scenarios with disposable vector fixtures; targeted `git diff --check` passed. No checks failed. No AI calls, corpus writes, historical PDF selection, neighboring edits, commits or pushes.

Remaining: root owns primary next-passage integration, native verification, combined current-state/log and final handoff. These browser checks do not establish native process behavior or compatibility with the actual historical scan.

Suggested next prompt: try several consecutive new lines, draw one new box, advance a PDF page, restart, and confirm each line retains its own location while earlier boxes remain guides only.
