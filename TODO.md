# MERIT unfinished work

This roadmap reflects code inspected on the `main` branch and changes currently proposed on `security/remediation-phase-1`. A change is not considered complete until the migration, tests, production build, deployment and relevant end-to-end checks have passed.

## Implemented on remediation branch — pending CI and deployment verification

- [x] Replace ordinary file deletion with a recoverable soft-delete state; preserve Blob and database record.
- [x] Add protected recovery listing and owner/admin restore endpoint.
- [x] Separate permanent erasure from ordinary deletion; owner-only, explicit confirmation, and disabled until a retention period is configured.
- [x] Add separate `files:recover` and `files:erase` permissions.
- [x] Add a dashboard recovery area with restore and permanent-erasure controls.
- [x] Replace destructive branch deletion with reversible archival and add restoration.
- [x] Prevent archived branches from appearing in active branch lists or receiving new service-completion events.
- [x] Persist platform-level and workspace-level Security Warden events.
- [x] Calculate Warden severity totals over a defined 30-day window rather than only the latest 100 rows.
- [x] Prevent caller-supplied metadata from overriding derived event severity.
- [x] Send workspace invitations by email instead of returning raw invitation tokens in API responses.
- [x] Scope insight generation to an explicitly selected, authorized workspace.
- [x] Atomically claim follow-up jobs to reduce duplicate sends from concurrent cron workers.
- [x] Recover stale follow-up claims after worker interruption.
- [x] Remove production `unsafe-eval` from the Content Security Policy.
- [x] Ignore all `.env*` files except the committed `.env.example`.
- [x] Replace deployment-specific trusted-origin entries with a strict dynamic Better Auth host allowlist for MERIT-owned Vercel domains.
- [x] Enforce webhook request-body size limits while streaming instead of buffering an unbounded body before checking its size.
- [x] Make file restore and permanent erasure mutually exclusive through conditional database state transitions.
- [x] Encrypt PostgreSQL backup dumps before GitHub artifact upload; backup execution remains blocked until the recipient and private identity are safely configured.
- [x] Require explicit `yes` confirmation and a protected GitHub `production` environment for the manual production-migration workflow; use a dedicated `MERIT_PRODUCTION_DATABASE_URL` environment secret.

## Still outstanding — security and governance

- [ ] Configure GitHub's `production` environment with required reviewers and verify its protection rules; the workflow's environment declaration alone does not prove approval is enforced.
- [ ] Verify the Resend sender domain, then enable and enforce email verification on signup; the current callback is configured but sending and enforcement remain disabled. Test verification expiry, resend, callback, and protected-route behavior end to end.
- [ ] Separate the Vercel Preview database from Production before write-capable preview testing; the current Preview-versus-Production `DATABASE_URL` assignment is not yet reconciled against the PR description; verify the actual Vercel target assignments before write-capable preview testing.
- [ ] Design and implement PostgreSQL RLS for every tenant-owned table only after defining a non-owner runtime DB role and transaction-scoped tenant context; add cross-workspace isolation tests before claiming database-enforced isolation.
- [ ] Add automated integration tests for soft deletion, recovery, retention enforcement and permanent erasure.
- [ ] Add tests for branch archival/restoration and webhook rejection for archived branches.
- [ ] Add durable Warden incident acknowledgement, assignment, investigation, resolution and escalation delivery.
- [ ] Add a platform-level role model for founder Super Admin, platform administrators and engineers.
- [ ] Bootstrap the founder Super Admin through a controlled, one-time process; do not hardcode an account or email.
- [ ] Build the dedicated Super Admin console and platform-level audit trail.
- [ ] Build Request Authorization with business approval, exact scope, read/write mode, expiry, revocation and emergency-access review.
- [ ] Enforce approved grants on every sensitive support/investigation operation.
- [ ] Add malware scanning, file-signature verification and server-verified file-size checks; keep failures quarantined.
- [ ] Verify email provider configuration, delivery, verification expiry and resend behaviour in production.
- [ ] Add password-reset delivery and account-recovery verification.
- [ ] Add MFA or equivalent stronger authentication for privileged accounts.
- [ ] Review CORS, rate limits, webhook replay protection and production error handling across every API route.
- [ ] Review and reduce CSP `connect-src` origins after mapping actual production integrations; move toward nonce-based scripts.
- [ ] Add safe retry/backoff policy for failed follow-ups and test provider idempotency.
- [ ] Add a defined workspace archival/deletion policy that preserves legally required audit history.
- [ ] Configure `MERIT_BACKUP_AGE_RECIPIENT` and keep the matching private age identity outside GitHub; backup workflow encrypts dumps before artifact upload. Document controlled decryption, off-platform retention and restore drills.
- [ ] Add backup monitoring, recovery objectives and documented disaster procedures.
- [ ] Add admin audit-log export and investigation PDF reports.
- [ ] Add incident notification and escalation workflows.
- [ ] Complete the 14-day guided trial, payment verification, expiry and conversion workflow.
- [ ] Verify production email, cross-browser behaviour, tenant isolation and full pilot onboarding.

## Product, trust and legal

- [ ] Rewrite the hero around the customer-feedback operations workflow: collect feedback consistently, identify recurring issues, and improve operations.
- [ ] Add an above-the-fold product proof visual or workflow example that explains the product in under five seconds.
- [ ] Add a three-step “How it works” section: completed service, feedback request, operational insight.
- [ ] Add concrete use cases for service businesses without claiming a narrower vertical until selected.
- [ ] Rewrite capability cards around operational outcomes rather than abstract feature labels.
- [ ] Standardize the primary CTA as “Create your workspace” and add only verified setup reassurance.
- [ ] Expand the footer with product, company, legal, and contact destinations.
- [ ] Publish privacy safeguards only when they match deployed implementation and contracts.
- [ ] Replace legal-identity placeholders after the owner supplies operating entity and registered address.
- [ ] Add Terms of Service and a security/trust page with verified claims.
- [ ] Add a clear privacy request and data-deletion route.
- [ ] Document subprocessors/providers after deployed configuration is confirmed.

## Authentication, accessibility and validation

- [ ] Add explicit label associations and accessible error descriptions to authentication forms.
- [ ] Verify password reset, email verification and recovery end to end.
- [ ] Test duplicate-account, invalid-input, server-failure, successful-signup and sign-in states.
- [ ] Ensure errors are adjacent, specific, text-based and announced to assistive technology.
- [ ] Run automated contrast/accessibility checks and keyboard/screen-reader flows.
- [ ] Verify direct loading of public, auth, invitation and customer feedback routes.
- [ ] Test 320, 375, 768, 1280 and 1440 pixel layouts.
- [ ] Test Chrome, Safari and Firefox where available.
- [ ] Run security tests, type diagnostics, lint, Prisma validation, production build and endpoint checks before merging.
- [ ] Verify the deployed preview uses the reviewed commit and required environment variables.


## PR #3 follow-up validation — 8 November 2026

- [x] Extract file-recovery retention parsing and eligibility calculation into a pure, testable module.
- [x] Add boundary tests for unset, malformed, fractional, out-of-range and valid retention settings, including the exact eligibility instant.
- [x] Include file-recovery policy tests in `npm run test:security`.
- [x] Require the database-backup workflow to use the protected `production` environment and dedicated `MERIT_PRODUCTION_DATABASE_URL` secret; do not dispatch it until the age recipient and private identity are safely configured.
- [x] Make invitation acceptance a conditional, single-use transaction; reject replay and concurrent acceptance conflicts.
- [x] Make branch archive/restore serializable and conditional; coordinate branch archival with serializable webhook processing.
- [x] Re-check customer consent immediately before follow-up dispatch; cancel queued and processing jobs when opt-out is recorded.
- [x] Add isolated PostgreSQL CI service and apply the full migration chain to a fresh CI database.
- [x] Add database integration coverage for file deletion/recovery generations, concurrent invitation acceptance, concurrent branch archive, webhook external-event uniqueness, concurrent follow-up claims and opt-out cancellation.
- [x] Latest-head CI run [42494051116](https://github.com/capredbeard08/Merit/actions/runs/42494051116) on commit `ef5d6039af362379d4216f985dc3b843fd5b9cbd` passed: isolated PostgreSQL migrations, security/database integration tests, TypeScript and production build.
- [x] Authenticated route tests use signed Better Auth sessions and cover cross-workspace file denial, file soft-delete/restore, branch archive/restore, invitation acceptance/replay, webhook duplicate handling and archived-branch rejection.
- [x] Follow-up cron route test verifies stale PROCESSING claim recovery and safe FAILED state when the email provider is not configured.
- [x] Record accepted-invitation token replays as high-severity Security Warden events; integration test verifies the event is persisted.
- [ ] Complete CI on the latest head after adding webhook replay and follow-up concurrency assertions.
- [ ] Add endpoint-level tests for authenticated file soft-delete/restore/erasure, branch archive/restore, invitation acceptance/replay, follow-up crash recovery and webhook archived-branch rejection. Current database tests validate persistence/concurrency primitives, not the HTTP route handlers themselves.
- [ ] Verify GitHub `production` environment required reviewers; a workflow environment declaration alone does not prove approval protection.
- [ ] Confirm backup encryption can be decrypted and perform a restore drill using the separately held private age identity before production use.
- [ ] Review every route's authorization and tenant-scoped relation traversal. PostgreSQL RLS is not implemented; do not claim database-enforced tenant isolation.
- [ ] Reconcile Vercel Preview and Production database target assignments before write-capable preview testing.
- [ ] Verify real email sender domain and run signup/verification/invitation delivery E2E before enabling email verification.
- [ ] Add malware scanning, file-signature verification and server-verified file-size checks; keep unverified uploads quarantined.
