# Neo consent browser repair — 2026-09-27

## Goal

Repair the user's blocked invited Neo sign-in to hosted Studio. The browser
reported a `form-action 'self'` CSP violation during Neo consent. Continue the
authorized VPS rollout without changing the user's password or recovery account.

## Files inspected

- Studio agent index, current state, repository map, open questions and VPS
  repair handoff; `server/identity.cjs`, `server/http.cjs`, browser callback and
  identity contract fixture.
- Neo `apps/api/app/api/routes/studio_identity.py`, identity/API tests, API test
  fixtures, dependency locks, identity workflow and existing daily deployment.
- Browser request status/Origin diagnostics from isolated actual Neo and Studio
  servers. No production authentication cookies or passwords were captured.

## Files changed

- Neo consent HTML permits its configured Studio callback in `form-action` and
  uses `Referrer-Policy: same-origin`. Code/API responses retain `no-referrer`;
  existing strict origin, invitation, PKCE and one-use-code checks remain.
- Neo identity tests check the configured callback, reject an untrusted redirect,
  and verify separate HTML/API referrer policies.
- Studio `server/tests/identity-contract.test.cjs` adds an opt-in real Chromium
  invitation/consent/callback flow and bounded startup readiness.
- Neo identity CI is wired to the reviewed Studio browser fixture with
  isolated PostgreSQL, existing locked Playwright and no frontend build.
- Studio fixture commit: `ba527158595de7256f162ffbd2d7df027437551e`;
  Neo repair commit: `d47e00947cbf55c80a2f5d961ba3926863475b15`. Both pushed to the
  existing branches; neither PR merged. Studio runtime need not change for this
  test-only commit; the application repair lives in Neo.
- Current state/log and this handoff record the browser verification boundary.

## Commands run

- Targeted `rg`, Git diff/status, source and workflow inspection.
- `make db-backup-prod` before deployment; gzip integrity passed for both fresh
  `20260927T143513Z` Neo database/media backups in its private ignored storage.
- Neo identity and existing API suites: 64 tests passed before the final
  page-only referrer adjustment; all seven focused identity tests then passed.
- Chromium using Neo's locked Playwright 1.58.2 against disposable real Neo/Studio
  fixtures: one passed, including actual callback/session and revocation. The
  old-CSP copy with corrected referrer policy failed specifically with
  `CSP violations: form-action`. Test schemas were removed and PostgreSQL stopped.
- `make deploy-daily` running from Neo with private log
  `.local/vps-qa/neo-csp-deploy.log` in Studio; final live check pending.

## What worked

- Diagnosed why HTTP-only identity tests missed the user's failure: HTTP clients
  do not enforce the consent page's browser policy.
- Browser tracing also proved a second failure: `no-referrer` made the native
  consent POST send `Origin: null`, which Neo correctly rejected with
  `origin_denied`. The repair preserves strict origin checking.
- Existing Neo data and recovery credentials remain unchanged.
- The exact original CSP regression is now reproduced in Chromium; final fixed
  headers complete the real invitation button, Neo consent form, Studio callback
  JavaScript, Studio cookie creation and subsequent session-revocation checks.
  No product assertion was weakened to make the test pass.

## What failed

- Original `form-action 'self'` excludes the cross-origin Studio callback.
- The first browser fixture stopped earlier at the null-origin rejection;
  the private old-policy copy subsequently isolated the reported CSP block.
- Browser fixture development exposed two harness issues: a deliberately blocked
  navigation left the page pending, and reading an already-successful response
  body after callback navigation failed. The final fixture focuses on the real
  sign-in flow, reads error bodies only on failure, and retains bounded safe
  status/Origin diagnostics. Neo's unit test checks the exact callback allowlist
  and rejects an arbitrary redirect destination.

## Remaining questions

- Complete Neo deployment and verify live headers/health and CI.
- User must reopen the original invitation for a fresh login attempt; the old
  authorization tab/state can expire. Their personal sign-in remains unconfirmed.
- Neither existing PR is authorized for merge.

## Suggested next prompt

Confirm the original invited account now completes Neo consent and returns to
Studio. If another error appears, inspect bounded browser/identity diagnostics
without requesting passwords or converting the independent recovery admin.
