# Collaboration server handoff — 2026-09-26

Optional server mode is under `server/`. Its contract and deliberate omissions are in
[collab-server.md](../design/collab-server.md); deployment is in
[deploy/collab](../../deploy/collab/README.md). The existing desktop entry and React source are
unchanged. The hosted HTML injects a separate browser bridge and collaboration panel.

## Review and validation

Local Node 22.16 execution passed 14 authentication, persistence, permissions and HTTP tests:
`node --test server/tests/*.test.cjs` (two integration opt-ins skipped). The two-browser harness
was attempted locally but Chromium's environment policy blocked loopback navigation with
`ERR_BLOCKED_BY_ADMINISTRATOR`; do not report that attempt as a browser pass. A dedicated CI
workflow builds the existing app, runs the two-browser transport harness, and runs a separate
real selected-Python-engine smoke against disposable public checkouts. The browser harness
uses a small editor fixture, not the complete React canvas. Read actual CI results separately.

Remaining staging acceptance: full React editor with the real Araújo PDF, contributor/reviewer
publication, real SMTP invitation/reset delivery, Caddy reconnects, backup restoration and
representative multi-user memory/latency. No production deployment, DNS/SMTP changes, real
invitations, paid model calls, or historical source publication were performed for this task.

## Constraints for the next change

- Keep the hosted RPC allowlist independent from Electron; new desktop endpoints default deny.
- Preserve per-passage compare-and-swap. Never adopt a remote version without its content.
- Reservations, comments and report distinct-passage counts normalize pending/canonical IDs.
- Do not mistake browser usage or presence for approved text, billable hours or Pix entitlement.
- Shared server state is one workspace and one process; accounts are not isolated projects.
- The trusted Python engine is not a sandbox for uploaded repositories. Provider/grammar repair
  endpoints are disabled. Do not add public paid AI without per-account authorization/budgets.
- Preserve local recovery copies when conflicts or expired sessions prevent saving.
- Do not enable a second public Caddy or replace the existing Academia Tupi sites. Reuse the
  verified shared `caddy_edge`; configure SMTP secrets outside Git.
