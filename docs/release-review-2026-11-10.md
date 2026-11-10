# MERIT Consolidated Release Review — 10 November 2026

**Status: integrated candidate validated by CI; not approved for production release.**

This review supersedes the 31 October 2026 release review. It records the selective consolidation into PR #12 and distinguishes automated validation from staging, browser, provider and production verification.

## Candidate and branch strategy

- Repository: `capredbeard08/Merit`.
- PR #3 (`security/remediation-phase-1`) remains the security-remediation trunk.
- PR #12 (`integration/platform-access-pr3`) is the consolidated candidate, based directly on PR #3. It remains open and draft.
- PR #12 head reviewed: `476f027970c11fb0809afa2c8e7718adfc596a91`.
- PR #3 and PR #12 have not been merged. No production deployment, production migration, Vercel Preview deployment, account bootstrap or production data operation has occurred.
- PRs #1, #2, #4 and #7 are closed as superseded, not merged; their branches remain available.
- PRs #6, #8, #9, #10 and #11 have been selectively integrated into PR #12. They are source branches, not direct merge candidates. Close them only after the consolidated candidate's current-head checks remain green.

## Consolidated work

| Source | Integrated result | Remaining non-CI acceptance |
|---|---|---|
| PR #8 — Platform Access | Platform roles/capabilities, Founder console, support approvals, MFA foundation, rate limits, audit/security events and bootstrap guard | MFA recovery/browser flow, verified email delivery, controlled non-production Founder bootstrap rehearsal |
| PR #9 — Guest Feedback | Permanent QR codes, public no-sign-in feedback, branch/workspace composite constraints, QR lifecycle, optional Google review destination | Real-device QR scan/print and mobile/browser acceptance; confirm Google review is optional and never rating-gated |
| PR #10 — Red Squid Security Warden | Incident/finding/artifact/approval/hunter schema, Founder-only approval capability, approval API/console, bounded leases, private ClamAV worker and upload scan queue | Host the worker privately and run a non-production Blob → queue → scan → artifact end-to-end test; no scanner is deployed |
| PR #11 — Groq and email readiness | On-demand feedback themes, explicit per-request external-processing confirmation, content-free audit record, bounded/redacted payload, Resend templates and email gate | Real Groq staging call after processor/retention review; controlled email-delivery and verification journey |
| PR #6 — Dashboard | Warm-ivory/forest-green sidebar and responsive visual refresh adapted onto the workspace-aware dashboard | Authenticated browser review on desktop/mobile after an authorised isolated Preview is available |

## Current-head automated validation

PR #12 head `476f027970c11fb0809afa2c8e7718adfc596a91`:

- MERIT CI run [#42917317613](https://github.com/capredbeard08/Merit/actions/runs/42917317613): **passed**.
  - Disposable PostgreSQL migration replay.
  - Security Warden, platform/support, Guest Feedback and Groq consent/audit integration tests.
  - TypeScript application check.
  - Isolated security-worker TypeScript check.
  - Production application build.
  - Private Red Squid scanner image build and four isolated ClamAV runtime smoke checks.
- Red Squid Code Hunter run [#42917317345](https://github.com/capredbeard08/Merit/actions/runs/42917317345): **passed**.
  - CodeQL scan.
  - Strict full npm audit gate: zero reported vulnerabilities after compatible dependency updates.

These results validate the GitHub candidate build and isolated scanner image. They are not a live production test, an authenticated browser test, a real Groq request, an email-delivery test or a hosted scanner end-to-end test.

## Security and data-handling boundaries

### Tenant and access control
- Workspace selection remains explicit; membership is resolved for the selected workspace.
- Workspace/branch/QR/feedback relationships are tenant-constrained in the database and route queries are workspace-scoped.
- Do not describe this as PostgreSQL Row Level Security: no RLS policy/catalog verification is claimed.
- Platform role alone does not grant support access to workspace customer data. No customer/feedback/file data-read route is enabled for support operators.
- Red Squid approval authority is limited to the Founder Super Admin capability.

### Recoverability and uploads
- Do not introduce hard-delete routes, purge timers or permanent-erasure workflows.
- Uploaded objects remain private and quarantined pending verified scanning. The scanner preserves the original Blob and FileAsset; a CLEAN verdict does not automatically release a file.
- Disposal approval records authorisation only; there is no disposal executor in this candidate.

### Guest Feedback and AI
- Public Guest Feedback is no-sign-in and uses unguessable public QR identifiers.
- Google review links are optional and are not gated by a feedback rating.
- Groq analysis is on-demand and requires explicit confirmation on every request, enforced in both UI and API.
- Up to 100 recent written comments and ratings may be sent to Groq after pattern-based redaction. Pattern redaction is **not anonymisation**; the UI warns users not to submit sensitive comments.
- The request is workspace-scoped, sends no customer/workspace/branch/QR identifiers, is rate-limited, and creates a content-free audit entry before external processing. Model output is not persisted.
- No real Groq provider request has been made as part of CI.

### Email
- Resend transport and templates are unit-tested, but real email delivery has not been verified.
- Email verification remains disabled by default. Both `requireEmailVerification` and `sendOnSignUp` require `MERIT_EMAIL_VERIFICATION_ENABLED=true`.
- Do not enable that flag until the sender domain and `EMAIL_FROM` identity are verified, test messages are delivered, and sign-up/resend/verification/sign-in/password-reset flows pass end to end.
- CI's `MERIT_CI_AUTH_TESTS=true` is scoped to the test step only; it is not a deployed CAPTCHA bypass.

## Outstanding pre-merge and release gates

1. Refresh and commit the repository's `package-lock.json` to match the audited dependency graph and current `package.json`; the audit workflow regenerates the lockfile in CI, but that generated lockfile has not yet been committed to the branch.
2. Run authenticated desktop/mobile browser acceptance on an authorised Preview using a genuinely isolated Preview database. Do not assume Preview/Production database isolation without checking it.
3. Verify real QR scan, print, guest submission, workspace dashboard and optional review-link flow.
4. Run a controlled non-production Groq request after reviewing applicable processor and retention terms.
5. Verify Resend sender domain and complete the email journey before enabling verification.
6. Complete MFA recovery/browser tests and a non-production Founder bootstrap rehearsal. No bootstrap secret is set by this work.
7. Host Red Squid privately, then run a non-production upload-to-scan end-to-end test with isolated Blob/queue credentials. Never expose the unauthenticated ClamAV socket.
8. Complete route-by-route tenant/role review and recoverability/restore testing.
9. Obtain explicit approval before any merge, Preview deployment, production migration, environment change, account bootstrap or production data action.

## Release decision

PR #12 is the consolidated code candidate and its current automated gates pass. It is **not production-ready** until the outstanding lockfile, authenticated browser, provider, email, MFA, Founder bootstrap and hosted-scanner acceptance gates are completed and reviewed. Keep PR #3 and PR #12 open; keep PR #12 draft until then. No production action is authorised by this document.

## Pull requests

- [PR #3 — Security remediation trunk](https://github.com/capredbeard08/Merit/pull/3)
- [PR #5 — Release review documentation source](https://github.com/capredbeard08/Merit/pull/5)
- [PR #6 — Dashboard visual source](https://github.com/capredbeard08/Merit/pull/6)
- [PR #8 — Platform Access source](https://github.com/capredbeard08/Merit/pull/8)
- [PR #9 — Guest Feedback source](https://github.com/capredbeard08/Merit/pull/9)
- [PR #10 — Red Squid source](https://github.com/capredbeard08/Merit/pull/10)
- [PR #11 — Groq and email source](https://github.com/capredbeard08/Merit/pull/11)
- [PR #12 — Consolidated candidate](https://github.com/capredbeard08/Merit/pull/12)
