# MERIT Integrated Staging Acceptance Plan

Status: **prepared; not executed**
Scope: PR #7 workspace selection and tenant protections, PR #8 platform access, PR #9 Guest Feedback, and PR #10 Red Squid Security Warden.

## Release guardrails

- This plan is for a disposable, isolated staging environment only.
- Do not use production customer data, production credentials, or the current pilot database.
- Do not run migrations against production as part of this plan.
- Do not deploy to Vercel Preview or Production, change Vercel project settings, or enable production traffic without separate explicit approval.
- Keep RLS disabled until the tenant database role, transaction-local workspace context, and policy tests are implemented and reviewed.
- Scanner tests must use harmless test fixtures and the isolated ClamAV service. Never upload real customer files or live malware samples to an unapproved environment.

## Current evidence before staging

| Area | Evidence already available | Still not proven |
|---|---|---|
| CI | PR-triggered and push workflows pass for the reconciled branches; Prisma migration replay, integration suites, TypeScript and production builds pass | Real browser/device acceptance |
| Workspace isolation | Database relation guards, immutable workspace ownership, membership-revocation race tests and HTTP route negative tests | Exhaustive endpoint, relation-traversal, bulk-operation and worker isolation |
| Platform access | Founder bootstrap, operator grant/revoke, support request lifecycle, MFA challenge/session guard and approved support-read guard are integration-tested | Real mail delivery, real user MFA enrollment/recovery, deployed edge rate limiting |
| Guest Feedback | Public QR submission, idempotency, rate limits, paused/revoked QR checks and dashboard persistence have integration coverage | Printed QR scan, guest browser UX, Android/iOS and real branch pilot |
| Red Squid | Queue/approval lifecycle tests, worker TypeScript, private image build and isolated ClamAV smoke test pass | Hosted worker, live private Blob retrieval, runtime monitoring and production quarantine/release workflow |

## 1. Staging environment prerequisites

- Create a separate staging database and verify its connection string cannot reach production.
- Create a separate private Blob store/container and a separate test email provider/domain.
- Use staging-only values for `AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `FEEDBACK_TOKEN_SECRET`, reCAPTCHA keys, Blob credentials and scanner credentials.
- Verify the reCAPTCHA site key and secret key are both registered for the exact staging host.
- Configure and verify a real sender domain before enabling email verification or sending guest follow-ups.
- Configure Vercel Firewall/WAF rate limits for public authentication, guest-feedback and webhook endpoints. The application-level database limiter is not a substitute for an edge rule; no Vercel firewall setting is asserted as configured by this plan.
- Provision the Red Squid worker as an isolated service with least-privilege access to the staging queue and private staging Blob store only.
- Enable logs, alerts, queue-depth monitoring, worker-heartbeat monitoring and a quarantine review path.
- Take a staging database snapshot and verify that a restore can be completed before applying the candidate migration chain.

## 2. Workspace and tenant-isolation tests

Use two separate workspaces, two owners, one member with restricted permissions, and one non-member.

- [ ] Each user sees only workspaces they belong to.
- [ ] Switching the selected workspace changes all dashboard queries and mutations to the selected workspace ID.
- [ ] Direct API requests for another workspace return a non-disclosing denial and reveal no names, counts, file metadata or related records.
- [ ] Cross-workspace IDs are rejected for branch, feedback, file, member, invitation, insight, reply and security-event operations.
- [ ] Bulk updates and deletes retain workspace predicates at the mutation itself.
- [ ] Relation traversal cannot return a foreign workspace's parent or child.
- [ ] Membership revocation and role downgrade race tests deny operations when revocation wins first.
- [ ] Public feedback tokens cannot be substituted across feedback IDs or reused after a completed reply.
- [ ] Invitation tokens are single-use, expiry-bound and accepted only by the intended email identity.
- [ ] The follow-up worker processes only claimed jobs and rechecks workspace, status, consent and opt-out state before dispatch.
- [ ] No test assumes RLS is active. Record application-level enforcement separately from database relation guards.

## 3. Platform access and support-consent tests

Use separate Founder, Platform Admin, Engineer, business Owner, business Admin and ordinary Member accounts.

- [ ] Founder bootstrap succeeds once, requires a verified account, secret, recent authentication and a session issued after successful TOTP verification.
- [ ] A stale session created before MFA enrollment is denied for privileged actions.
- [ ] Password sign-in for an MFA-enabled account does not create an authenticated session until TOTP or a valid backup code succeeds.
- [ ] Platform operator grants/revocations enforce role boundaries, recent authentication, MFA, rate limits, serializable updates and audit events.
- [ ] Founder protections and self-revocation restrictions hold.
- [ ] A platform operator cannot read workspace data before business approval.
- [ ] Business Owners/Admins can approve, deny, revoke and review only requests for their own workspace.
- [ ] Support access expires at the approved time, remains read-only and is constrained to the approved scope.
- [ ] Support data routes call the approved-read guard and require a recent MFA-verified platform session.
- [ ] No support route exposes customer records, file contents or feedback text outside the approved scope.
- [ ] Email verification and password-reset flows work with the configured sender domain.

## 4. Guest Feedback QR journey

- [ ] Create a permanent QR code for each staging branch.
- [ ] Print the QR code at intended table/counter size and scan it using at least one Android and one iOS device.
- [ ] Guest form loads without an account or sign-in.
- [ ] Submit ratings with and without optional comments.
- [ ] Retry after a simulated connection interruption; the same submission key must not create duplicate feedback.
- [ ] Confirm paused, revoked, archived-branch and malformed QR links cannot accept new feedback.
- [ ] Confirm rate limits apply per IP and per QR code and return a retry interval.
- [ ] Confirm feedback appears only in the correct workspace dashboard and branch.
- [ ] Confirm the Google review link is optional and offered after submission regardless of the rating.
- [ ] Confirm QR printing/download works from the dashboard and the printed code resolves to the expected staging host.

## 5. Red Squid upload-to-verdict journey

Use harmless EICAR test data only in the isolated staging scanner environment, plus clean test files.

- [ ] Upload a clean file through the authenticated MERIT upload flow.
- [ ] Verify the upload remains unavailable until the configured scan policy allows release.
- [ ] Verify the worker receives one queue job and handles retries/idempotency without duplicate actions.
- [ ] Verify the worker retrieves the private Blob using least privilege and validates pathname, byte size and SHA-256 before scanning.
- [ ] Verify a clean verdict follows the explicitly approved release path.
- [ ] Verify an EICAR detection is quarantined and creates the expected incident/finding/audit trail.
- [ ] Verify unknown, timeout, corrupt-file, missing-Blob and scanner-unavailable outcomes fail closed and remain quarantined.
- [ ] Verify an approval is bound to the artifact hash, action scope, expiry and one-time nonce.
- [ ] Verify unauthorized roles cannot approve or execute actions.
- [ ] Verify rollback/recovery metadata and chain-of-custody records are present.
- [ ] Verify worker health, heartbeat, queue age, retry count and scan latency alerts.

## 6. Operational and recovery tests

- [ ] Restore the staging database snapshot into a clean staging database and verify application startup.
- [ ] Verify the migration chain from an empty PostgreSQL 16 database and from the prior staging snapshot.
- [ ] Test the documented rollback/recovery procedure for each migration before any production change is considered.
- [ ] Verify application secrets are server-side only and absent from client bundles, logs and Git history.
- [ ] Verify debug output is disabled and security/audit logs redact secrets, tokens, customer messages and file contents.
- [ ] Verify edge rate limits, application rate limits, CAPTCHA, email sender, Blob permissions and scanner credentials independently.
- [ ] Verify backup schedule, retention, restore time and responsible operator.
- [ ] Run the full PR CI suite after any staging-specific fixes.

## 7. Exit criteria

Staging is accepted only when all applicable checks above have recorded evidence, all critical/high findings are resolved or explicitly accepted, a restore drill has passed, and the product owner approves the release decision.

Passing GitHub CI alone is not staging acceptance. Staging acceptance is not production authorization. Production migration, Vercel deployment, scanner hosting, RLS activation and traffic cutover each require their own explicit approval.
