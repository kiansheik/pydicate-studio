# Collaboration research / operations / identity handoff — 2026-09-27

User requested indefinite thesis evidence, PostgreSQL, reproducible Make/SSH install and redeploy,
laptop backup-to-Git review, contributor docs/DNS and reuse of Neo identity. Studio PR #2 remains
a draft; a companion Neo PR adds the code issuer. No production changes are implied.

## Implementation map

- `server/database.cjs`, `migrations/`, `store.cjs`, async auth/HTTP/runtime: PostgreSQL and exact-save history.
- `submissions.cjs`, `publication.cjs`, `digests.cjs`: immutable review snapshots, ancestry receipts/outbox.
- `identity.cjs`, public SSO pages: invited identity linking with PKCE/state and Neo revocation checks.
- `provider-vault.cjs`: encrypted API-key preferences only, not released hosted generation.
- `scripts/collab/`: laptop SSH driver, server lifecycle, offline DB/worktree importer, SSO env preparation.
- `deploy/collab/`: private PostgreSQL, Docker resources, same Caddy/SMTP network and DNS instructions.
- Root README, contributor guide and public `/help`: browser-first onboarding and data disclosure.

## Local checks performed before publishing

Real PostgreSQL 17 on a disposable local port: 30 Node unit/HTTP/research/identity tests passed;
three browser/engine opt-ins were skipped by that base command. A separate real Neo + Studio
HTTP identity contract test passed with a disposable Neo SQLite database. Six companion Neo
identity tests passed. Seven Python operations safety tests passed. Further CI now covers
actual compiled React/Python and the fresh Make/SSH/Docker install/backup/restore path; read
its actual results before asserting those checks passed. Local root npm build dependencies
were unavailable, so local unit checks must not be called a full browser/build verification.

## Deployment acceptance still needed

Real DNS, SMTP deliverability, Neo account linking across the deployed HTTPS origins, actual
Araújo PDF/crops, linguistic review/publication and concurrent-user load. No paid AI, real invites,
GitHub main merge or historical-source change was performed during implementation. UI help
prompts can follow observed usage; existing `/help` works beside the editor.

## Preserve these boundaries

Do not reintroduce research expiry or revision coalescing; expired sessions/leases are different.
Never silently reset dirty server repos, import ambiguous source anchors, certify ground truth
from generated equality, or equate presence with billable output. Copy no Neo password hashes
and widen no cookie domains. Keep a local admin recovery path. Provider keys are not OAuth
subscription sessions. Audit migration checksums and fresh-source install tests before release.
