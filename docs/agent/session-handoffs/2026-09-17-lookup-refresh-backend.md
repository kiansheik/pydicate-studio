# Lookup refresh: backend and desktop transport

## Goal

Allow the interface to recover a read-only lookup after external corpus or grammar changes without replaying stale insertions or applying an outdated source patch.

## Files inspected

`python/authoring_service.py`, `adapter.py`, `rendered_structures.py`; `electron/main.cjs`, `preload.cjs`, `python-worker.cjs`; existing pending/dictionary/reuse tests; `src/domain/authoring.ts`, `project-recovery.ts`, `structure-drafts.ts`, and the refresh path in `useStudio.ts`.

## Files changed

- `electron/service-errors.cjs`: bounded error-only reply carrying service code and message; success result shapes unchanged.
- `electron/main.cjs`: transport that reply only for coded `studio:invoke` failures.
- `electron/preload.cjs`: recognize the reply and reject with `[STUDIO:CODE] message`. Electron discards custom Error fields across both IPC and contextBridge, so the renderer must normalize the prefix into its own `Error.code`.
- `electron/tests/service-errors.test.cjs`: real preload loaded in a VM, with simulated contextBridge Error-copy behavior.
- `python/tests/test_lookup_refresh.py`: disposable corpus regeneration and stale selection/write regression tests.

The root agent owns renderer normalization, coalesced project refresh, browse-only retry, and final native verification. No Python production guard was weakened or removed.

## Commands and results

- `node --test electron/tests/service-errors.test.cjs electron/tests/python-worker-authoring.test.cjs`: 5 passed.
- `python3 -B -m unittest python.tests.test_lookup_refresh -v`: 3 passed, about 10 seconds.
- `git diff --check`: passed.

The first Python fixture run failed because its disposable Git repository lacked HEAD. Adding the fixture commit fixed setup; no product defect was involved. All edits to corpus input occurred in a temporary copy. Actual source bytes were checked unchanged. No provider calls or neighboring-repository edits.

## Verified behavior

An externally changed source-local declaration rejects stale searches before engine evaluation. Refresh changes the engine/index fingerprints and returns the new rendered declaration. The previous candidate remains rejected with `STALE_STRUCTURE_INDEX`; its reviewed source patch remains rejected with `STALE_SOURCE`. Dictionary lookup keeps exact sense identity after refresh, while conversion with the old engine fingerprint still rejects. A different project or deleted passage never falls back to another namespace.

The transport validates codes with `^[A-Z][A-Z0-9_]{0,63}$` and bounds the message at 16,384 characters. Uncoded failures retain ordinary rejection semantics. Tests model contextBridge copying; they do not constitute a native Electron verification.

## Remaining questions / suggested next prompt

Complete the root agent's native check of automatic refresh while a picker remains open, confirming query and draft edits survive, concurrent lookups coalesce, and stale insertion requires a fresh selection. Consolidate those results in the main task handoff/current state/log.
