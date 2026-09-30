# Nasal mo production audit and correction

## Goal

Audit the production-only AI repair, verify all saved corpus lines, then implement
Kian's correction from `/` composition to `*` causative attachment and update only
the corresponding subtree in Emerson's current draft.

## Files inspected

Required agent wiki; local authoring_runtime, publication_regression,
authoring_service, grammar-repair, database/store/schema and idle service.
Production verb.py, noun.py, annotated_string.py, the two focused test modules,
AGENT_NOTES and grammar-navigation; the exact repair job/receipts and selected
draft row. Other draft checks returned identifiers only.

## Files changed

Local research report, current state, log and this handoff. Production applied
changes: `pydicate/pydicate/lang/tupilang/pos/verb.py`,
`pydicate/tests/test_compound_annotations.py`, `AGENT_NOTES.md`,
`docs/agent/grammar-navigation.md`, and one PostgreSQL draft with appended revision
and audit records. Applied at 2026-09-30T03:07:01.996Z: draft version 36,
history revision 922. Temporary maintenance claim released afterward.
No neighboring local repository edits or corpus/reference publication.

## Commands run

Targeted rg/sed/git inspection; SSH with the existing neologismotupi key; private
server-side `docker exec ... python3 -B` and Node database reads. Staged correction
and recovery material live in `/data/operations/mo-causative-20260930` inside the
Studio container. `verify.py before`, `verify.py stage`, `verify-live.py`, and
`apply.cjs` provide reproducible checks and a guarded application.

## What worked

Original-repair parity: all 150 rows unchanged; original suite 28 tests passed.
Staged and applied correction: 29 tests passed, all 150 corpus rows unchanged, no reference
regressions. Full corrected draft evaluates `atara oîmombytá` instead of
`mombytáatar`. Exact operator-only replacement retains the rest of the tree.
Independent post-commit reads confirm only raw, revisionId and updatedAt changed;
history exactly matches before/after. Fresh evaluation used the persisted draft.

## What failed

Initial staging loaded the original engine through corpus bootstrap; fixed by
importing and asserting the selected module path before lexicon initialization.
Automatic review rejected bulk export and unrelated raw draft snippets; narrowed
server-side checks succeeded. First application safely aborted before changes
because Emerson still held an active claim, despite Kian leaving the passage.
Kian explicitly authorized overriding it. A maintenance client temporarily blocked
that passage during the version-guarded transaction; the account was not disabled.
The maintenance claim was released after verification.

## Remaining questions

The complete sentence's argument configuration remains for editorial review.
Earlier local UI fixes are still uncommitted and undeployed. Live grammar changes
remain uncommitted and were not copied into neighboring local repositories.
Browser sessions may need workspace refresh for the new engine fingerprint;
no browser acceptance is claimed.

## Suggested next prompt

Review the full sentence's argument structure and deploy the separate UI work;
preserve the corrected live grammar when reconciling it with upstream.
