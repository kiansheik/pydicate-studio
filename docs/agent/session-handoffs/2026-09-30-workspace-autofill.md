# Workspace autofill — 2026-09-30

## Goal
Keep saved emails/passwords out of authoring fields, preserving actual login autofill.

## Inspected
Agent guide/state/map/questions; all React native controls; hosted panel/history
control factories; account.html/auth.js; app entry HTML; MDN autocomplete guidance
and 1Password's compatible website design documentation.

## Changed
New `src/domain/workspace-autofill.ts`, spread on all existing native workspace
controls in 30 React files. Uses autocomplete=off, data-1p-ignore=true and
 data-lpignore=true. The main app body also opts out of 1Password. Hosted panel
and history factories mark controls before insertion, including password-change,
API key and admin invite fields. Account/login/reset page code is unchanged.
Docs: current-state/log/repo-map/this handoff. Preserved prior deployment notes.

## Commands / results
`npm run build:app`: passed (existing large-chunk warning).
Existing Playwright default desk and hosted source editing checks run.
`git diff --check`: run before commit.
No generated files or corpus/grammar content edited.

## Limits / remaining questions
Browser and extension heuristics can override autocomplete=off. Explicit extension
ignore hints help; actual saved-credential profiles require user confirmation.
Do not use fake password fields, disable paste, or change user-entered values.
Deployment and live DOM verification pending.

## Suggested next prompt
Confirm credential autofill behavior in the contributors' actual browsers after
reload; identify the browser/password-manager if it still ignores these hints.
