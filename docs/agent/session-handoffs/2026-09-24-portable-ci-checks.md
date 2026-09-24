# Portable CI checks for installer publication

- Goal: unblock the ordinary Checks workflow alongside the approved all-platform
  installer release without requiring the author's sibling repositories.
- Inspected: `.github/workflows/check.yml`, failed GitHub run `36011518134`,
  `package.json`, `scripts/build-learning.py`, current approval/notes interfaces,
  and the affected fixtures listed below.
- Changed: Checks uses `build:app` and the checked-in reference library instead of
  invoking author-selected corpus documentation regeneration; Python is 3.13,
  matching the runtime. `dictionary-transform.test.cjs` honors the selected
  project environment. `pending-assistant-context.test.cjs` supplies the current
  lexical-notes read interface. `test_passage_order.py` inherits the same explicit
  repository availability requirement as its reused fixture.
  `test_runtime_tree.py` exercises the current approval sink with a standalone
  source and selected-engine boundary, retaining mismatch/no-write and successful
  recovery-journal assertions.
- Commands: failed-run inspection; Prettier and `git diff --check`; focused
  dictionary/assistant/approval tests; full desktop and Python suites with
  `PYDICATE_PROJECT_PARENT` set to a deliberately unavailable fixture directory.
- Worked: desktop 265 passed, 3 repository-dependent skips; Python 154 passed,
  218 repository-dependent skips. Focused dictionary 5 and assistant 4 passed.
  A clean public-main desktop run also passed 265 checks before exposing the
  three now-repaired assistant mock failures.
- Failed: the first desktop run was denied Unix sockets by the execution sandbox;
  rerunning with socket access resolved those environment failures. The previous
  CI run failed because `docs:build` had no selected external corpus.
- Remaining questions: browser-suite and hosted CI outcomes are recorded by the
  publishing task. Existing corpus-dependent checks still require an explicit
  local fixture and are not claimed by the portable suite.
- Suggested next prompt: inspect the published release run and platform startup
  evidence, then validate installation on real Windows/Linux/Intel Mac machines.
