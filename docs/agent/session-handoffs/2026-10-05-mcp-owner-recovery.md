# Recover stale MCP ownership after restart — 2026-10-05

## Goal

Restore reliable full-tree/selected-subtree grammar repair after the user's
`OWNER_ACTIVE` failure. Preserve the saved request about `ba'e`/`sara`, research,
credentials and earlier performance work. This task fixes the transport; it does
not edit linguistic rules or resume paid inference.

## Confirmed cause

Live release `9121153` was healthy with zero container restarts. The latest repair
(`job:ef6cb72b-791c-480f-90b9-27d17b043c8f`) failed at 2026-10-05 14:07:39 UTC,
five seconds after starting, with `OWNER_ACTIVE` and zero grammar edits. Its
five events were preparation/final verification rather than a completed provider
repair. The reported incorrect surface is therefore not evidence of an applied
correction.

`/data/analysis/mcp/mcp-owner.json` still named PID15 and a socket created at
2026-10-03 13:02:48 UTC, before the earlier V8 crash. The socket no longer existed
(`ENOENT`), but `/proc/15/comm` identified the replacement application's live
process. The gateway treated `kill(pid,0)` success as proof of an active old
owner. It also cached a rejected `startPromise` indefinitely. This was an internal
process-ownership failure, not contributor/admin authorization.

The previous performance rollout preserved this stale discovery record and did
not exercise actual gateway startup; its HTTP health check could not detect it.

## Changes

- `runtime/studio-mcp-gateway.cjs`: bounded local-only endpoint probe replaces
  PID liveness as the discriminator. Only missing/refused endpoints are reclaimed;
  reachable owners are refused, and malformed/permission/timeout failures preserve
  the record. Failed startup cleans up and can retry on the same unclosed instance.
- Acquisitions use a random immutable owner identity. Per-canonical-profile
  serialization prevents in-process start/recovery/close races; cleanup checks
  identity and endpoint before unlinking discovery. Close drains starts and scope
  preparation, is idempotent, and cannot reopen a closed instance.
- **Boundary:** cross-process exclusion is still the hosted kernel-held lock in
  `server/start.cjs`. The gateway queue does not claim to replace that lock.
- `server/studio.cjs`: AI-enabled startup opens the actual local authoring gateway
  before HTTP readiness. It starts no job/provider work; a failure closes the
  candidate service/worker. AI-disabled startup does not acquire MCP ownership.
- `runtime/tests/studio-mcp-lifecycle.test.cjs`: nine race/recovery/error-path cases.
- `runtime/tests/grammar-repair.test.cjs`: a provider-free selected repair uses
  the real authenticated MCP connection to read/edit/check a temporary grammar
  after recovering a stale record with the current PID. The source draft stays
  unchanged; linguistic confirmation remains explicit.
- `server/tests/mcp-startup.test.cjs`: hosted readiness, real-owner refusal/cleanup
  and AI-disabled behavior, without database/provider calls.

## Inspection and commands

Read agent index/current state/repo map/open questions; inspected gateway,
analysis service/next service, hosted lifecycle, maintenance/deploy and existing
MCP/grammar tests. Read live release/container/discovery metadata and summarized
job status without reading capability tokens or invoking providers. Private
operational evidence is under `.local/owner-repair-20261005/`.

- Hosted regression before gateway fix: 1 expected failure (`OWNER_ACTIVE` for
  missing socket/current PID), 2 passes.
- Selected grammar MCP + startup focused regressions after fix: 4 passed.
- Hosted worker/startup/maintenance focused checks: 9 passed.
- Gateway lifecycle: 9 passed; existing stdio/protocol suite: 5 passed; killed-owner
  recovery also passed. Temporary fixture grammar changes only.
- Targeted Prettier and `git diff --check`: passed.
- Full runtime: 308 passed, zero skipped/failed (18.4 s). Full hosted suite with
  disposable PostgreSQL: 132 passed, ten expected conditional browser/real-project/
  Neo scenarios skipped, zero failures (4.7 s). The fixture cluster was stopped
  and removed. Independent review found no blocker in preflight or selected MCP
  integration. Live rollout is recorded below when complete.

## What failed / limitations

The initial lifecycle fixture exceeded macOS's Unix socket path length; it was
shortened to the genuine generated endpoint shape and passed. Neither that
fixture issue nor the expected pre-fix reproduction changed live data.

Local tests establish transport/recovery behavior, not the linguistic correctness
of `oporomoikobeba'e`. The failed saved request remains available for explicit
resume after deployment. No admin authorization bypass or active-writer takeover
was introduced.

## Remaining questions / next prompt

Record protected private deployment, fresh live owner/socket readiness and exact
before/after research parity. Suggested next prompt: “Resume the saved correction
in Studio and inspect its checked rule change and target result.” Do not trigger
that inference implicitly while verifying this infrastructure fix.
