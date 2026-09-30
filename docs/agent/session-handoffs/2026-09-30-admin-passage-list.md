# Admin passage list organization

## Goal

Let Kian clean up transient duplicate/out-of-order passages directly in the hosted
list: reorder, duplicate and delete, while keeping recoverable research history.

## Files inspected

Store transactions/history, HTTP admin/patch routes, browser snapshot transport,
draft validation, pending projection and publication migration, useStudio save
queue, navigator, source test harness, deployment scripts and prior handoff.

## Files changed

- New server passage-management module and focused PostgreSQL tests.
- Store protects admin metadata and rejects edits of excluded entries; admin HTTP
  endpoint, browser capability and snapshot adoption.
- Draft types/validators, organization projection, useStudio action and canonical
  project ref, navigator manager dialog and responsive styles.
- Domain/browser tests and optional simulated admin harness.
- Current state, repo map, open questions, log and this handoff.

## Commands run and results

- TypeScript build/typecheck passes.
- Domain next-page, model and structure-index suites: 33 pass. Excluded drafts do not enter the reuse index or orphan recovery.
- Disposable PostgreSQL core + management suite: 16 pass in ~2.2s. Covers role
  rejection, stale retry rejection, exact source membership, metadata tampering,
  deleted-entry save rejection, duplicate approval clearing and immutable history.
- Admin browser workflow and contributor visibility: 2 pass at 800×600, including reload and canonical restoration. Existing source creation/switching: 3 pass.
- Production build and diff whitespace checks pass. Generated learning JSON from the build was restored; no generated corpus changes.

## What worked / what failed

No schema/dependency changes needed. Existing JSON drafts carry validated admin
metadata. Admin mutations are serialized and version checked; a retried duplicate
request with its old revision cannot make a second copy. Source files stay intact.
The initial browser test used the default advanced preference but asked for the
basic-mode compact navigator; corrected the fixture to use basic mode. The next run exposed an implicit label locator mismatch; made the passage selector explicitly labelled. Both cases now pass.

## Remaining questions

No production entries were automatically deduplicated or deleted. Identical text
alone is not evidence that a repeated passage is unintended. Exclusion is from
the active Studio list; canonical corpus/reference records remain. Last active
project entry requires creating another before exclusion. Desktop does not expose
these hosted admin controls. PDF crops are not duplicated.

## Suggested next prompt

Use Organizar passagens to place the final Araújo passages in the intended order
and exclude confirmed accidental duplicates; audit any remaining source-level
changes separately.

## Live visual check

First rollout `3613067` completed in 51.6 seconds. The authenticated read-only
smoke saw all 114 source entries and the admin actions at 800×600 with no content
writes or browser errors. Visual inspection found reference-only passages labelled
Por transcrever and dark-mode paragraph contrast too low. Follow-up uses canonical
reference labels (including archived records), raw-expression fallback, inherited
text color, and the selected row's current position. Focused browser tests pass
again, now covering the canonical-reference label.
