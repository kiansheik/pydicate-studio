# AI authoring critic round 3: persistence and failure behavior

Independent review after the first two critic rounds and their fixes. This round
used disposable profiles, deterministic providers, ordinary concurrent MCP
clients and an actual killed owner process. It made no inference request and no
write to the original corpus, lexicon, ground truth or neighboring repositories.

## Findings and corrections

1. **P1 — Different external clients shared request identities.** The gateway
   derived its durable operation key from the attempt and JSON-RPC request ID.
   Those IDs belong to each client connection: two ordinary clients commonly
   both begin at one. In the independent probe, both clients initialized with
   ID 1; client A's `studio_context` with ID 2 succeeded, but client B's
   `studio_guide` with ID 2 returned `OPERATION_CONFLICT`. Identical mutations
   could instead receive another client's cached result.

   **Fixed and rechecked:** ordinary IDs now include a random connection
   namespace, including the distinction between numeric and string IDs. An
   optional `_meta['studio/operationId']` explicitly identifies a command that
   should be retried across connections within the same attempt. Both clients
   now succeed; repeated same-connection requests and explicit cross-connection
   command retries reuse their result, while changed command arguments conflict.
   The documented reconnect behavior does not promise implicit exactly-once
   mutation from a bare JSON-RPC request number.

2. **P1 — Replaying cancellation could cancel a newer attempt.**
   `analysis_cancel` validated its operation ID but did not persist or check it.
   The independent service probe cancelled attempt 1, explicitly retried the
   job, observed attempt 2 running, then repeated the original cancellation.
   Attempt 2 became cancelled even though that old command had already been
   acknowledged.

   **Fixed and rechecked:** cancellation records its command and bound attempt
   atomically before aborting that exact active attempt. Replaying it returns
   committed state without another abort. The same probe now leaves attempt 2
   running. A permanent service regression covers this ordering; late provider
   events and tools remain rejected after an attempt ends.

3. **P2 — An external retry treated retained work as a new completion.**
   The external runner completed as soon as it found any saved question or
   proposed candidate. A cancelled/interrupted attempt can legitimately leave
   either behind. The runner probe returned the prior question immediately on
   the new attempt, closing its scope before the client could continue.

   **Fixed and rechecked:** the owner captures question identities and candidate
   revisions/status/timestamps before exposing the new scope. The runner keeps
   those records readable and waits for a new question or newly proposed
   candidate. Old work alone now reaches the explicit timeout, and new actions
   complete normally. Capturing the baseline before scope publication avoids
   losing a fast client's first action.

An additional receipt-replay check identified a related acknowledgement edge:
freshness checks previously preceded lookup of an already committed acceptance.
The owner corrected this before the final recheck. An exact acceptance replay
after publication or later human edits now returns the current envelope and
original receipt, repairs a missing analysis-store mirror, and does not reapply
the old candidate. A new acceptance still undergoes every freshness check;
reusing an operation ID with changed bindings conflicts.

## Recovery and isolation evidence

- The new independent `analysis-crash.test.cjs` launches a real child owner,
  persists scratch plus an in-flight checkpoint and another queued job, then
  sends `SIGKILL` only to that fixture child. A new owner recovers the first job
  as blocked/interrupted with the exact input, scratch and checkpoint intact.
  Only the never-dispatched queued job runs automatically. The interrupted job
  requires explicit retry, adds a second attempt, retains its input and scratch,
  and rejects its old attempt identity.
- That process test starts from a version-1 draft envelope without
  `storageRevision` or AI fields. Analysis and recovery leave its bytes intact.
  Its first guarded save advances the storage revision while preserving all
  existing scholarly fields and canvas content.
- Service regressions verify concurrent stale envelope rejection, edits during
  input/evidence capture, provider unavailability, damaged immutable packets,
  source/engine changes, competing candidates, acceptance/undo provenance and
  interrupted acceptance-mirror recovery.
- Pending-to-published identity handling was independently rechecked against
  the owner's added regression. The displayed passage, selected candidate and
  conversation follow the stable UUID, while the original job/input identity
  remains unchanged. Post-publication feedback uses the same conversation;
  a new stale acceptance remains rejected.
- The legacy AI-history checks preserve prior requests/progress and reject
  corrupt records without rewriting their bytes or manufacturing approval.
- Three real selected-engine publication tests on disposable copies pass:
  simulated second-file replacement failure rolls back the lexical change;
  reviewed recovery restores both files; partial crash recovery accepts only
  exact reviewed changes. No model tool publishes or approves through this path.
- The native production report at `docs/reviews/ai-native-evidence.json` was
  inspected. It records actual external-owner CLI startup, managed PDF pixels,
  dictionary/evaluation, explicit draft acceptance, reviewed disposable source
  publication, history preservation and restart, with zero provider calls and
  unchanged original files. Those native interactions were executed by the
  implementation owner/UI agent, separate from this critic's process probes.

## Commands and results

- `node /tmp/pydicate-critic3.cjs`: reproduced the three findings. Initial
  sandbox Unix-listener `EPERM` was resolved by the scoped local-listener retry.
  Pre-fix evidence: `/tmp/pydicate-critic3-report.json`.
- `node /tmp/pydicate-critic3-fixed.cjs`: both clients succeed; the repeated
  cancellation leaves the new attempt running; retained external work alone
  does not complete the retry. Evidence:
  `/tmp/pydicate-critic3-fixed-report.json`.
- `node --test --test-name-pattern='external stdio|owner uniqueness|independent MCP clients' electron/tests/studio-mcp.test.cjs`:
  **3 passed**, including the new concurrent-client/explicit-retry case.
- `node --test electron/tests/analysis-service.test.cjs electron/tests/analysis-crash.test.cjs electron/tests/analysis-external.test.cjs`:
  **17 passed**, including actual process interruption, revised cancellation,
  acceptance replay and publication identity handling.
- `node --test --test-name-pattern='Historical ambiguous|Provider errors|Request progress|Persisted AI schema' electron/tests/providers.test.cjs`:
  **43 passed**, including nested corruption cases.
- `node --test electron/tests/draft-store.test.cjs`: **5 passed**.
- `python3 -B -m unittest python.tests.test_lexical_publication.LexicalPublicationTests.test_second_replace_failure_rolls_back_the_lexicon_and_cleans_staged_files python.tests.test_lexical_publication.LexicalPublicationTests.test_reviewed_recovery_reverts_both_files_and_itself_does_not_write_on_preview python.tests.test_lexical_publication.LexicalPublicationTests.test_partial_crash_state_can_recover_only_exact_reviewed_changes -v`:
  **3 passed** using disposable copies and the installed engine.
- Prettier completed for the gateway, external runner, their tests, the new
  crash test and MCP guide; the new process-test file passes `node --check`.

## Remaining boundaries

No blocker remains from this bounded persistence review. Local execution still
requires the owner process to remain alive; sleep/power loss and ambiguous
provider acknowledgements cannot guarantee exactly-once billing. The killed
process check establishes process-interruption recovery, not hardware power-loss
or filesystem-failure certification. File and directory sync improve the durable
write boundary but are not a distributed transaction across independent stores.
Authoritative acceptance receipts allow the mirror to be repaired on replay.

The actual installed dependencies in the native evidence are corpus
`292a28722a1790abf3f3b93083c29fbd47b4ffd0` and grammar
`348686045bf0791c847be3cba1b15eaae7312a11`; their dirty content identities are
recorded separately by the audit. Live linguistic usefulness and the historical
PDF font/codec limitation remain external verification boundaries. This review
does not convert fixture protocol success into a claim of linguistic correctness.
