# MERIT — implementation and release roadmap

**Last reconciled:** 3 November 2026  
This checklist distinguishes implementation/CI evidence from browser verification and production approval.

## Current repository state
- [x] Platform-access foundation remains on draft PR #8; guest feedback remains on draft PR #9. Neither is merged.
- [x] Corrected the CI pull-request base-branch filter so stacked PR #9 can be targeted.
- [x] PR #8 current head `b41f706` passed MERIT CI run #397: Prisma validation/client generation, disposable migration replay, support authorization integration tests, Security Warden tests, TypeScript, and production build.
- [ ] Obtain and verify a completed CI result for current PR #9 head `5b1ecff`; no PR-triggered run is visible yet.
- [x] Added composite workspace/branch/QR relation definitions and matching SQL constraints to the draft guest-feedback schema/migration.
- [x] Added guest-feedback integration tests for cross-tenant FK rejection, idempotency, rate limiting, and paused/archived QR states; execution remains pending CI.
- [x] Serialized public submissions against QR pause/revocation and branch archival by locking and rechecking rows in the write transaction.
- [x] Added sanitized security-event logging for rate-limit rejections and corrected the QR image CSP source.
- [ ] Validate combined PR #8 + #9 behavior before either is considered pilot-ready.
- [x] Existing pilot remains https://merit-olive.vercel.app/.
- [x] No production migration, production Founder bootstrap, or production rollout is authorized.
- [ ] Independently verify the Vercel preview-deployment setting; the project readback does not expose the flag. The deployment listing still shows the older `614b9c` preview as latest and no deployment for the new development commits.

## Platform-access foundation — implemented, not production-approved
- [x] Separate platform roles from workspace membership: Founder Super Admin, read-only Platform Admin, and Engineer.
- [x] Fail-closed platform capabilities, protected platform console, and operator directory.
- [x] One-time Founder bootstrap; operator management cannot create, grant, or revoke Founder.
- [x] Founder-only operator grants/reinstatements/revocations with transactional high-severity audit events.
- [x] Platform security-event feed and capped Founder-only CSV export with metadata allow-list and formula-injection protection.
- [x] Business-controlled, scoped, time-limited, read-only support-authorization foundation. Platform roles do not automatically grant customer-data access.
- [x] Password-reset pages, generic account-enumeration-safe confirmation, one-hour token expiry, and session revocation after reset.
- [x] Better Auth TOTP MFA foundation, encrypted backup codes, enrollment/settings and sign-in challenge screens.
- [x] Fresh-session plus enrolled-MFA requirements for privileged Founder/operator actions.
- [x] Database-backed rate limiting for privileged platform actions; fail closed when limiter storage is unavailable.
- [x] Private upload metadata checks, 50 MiB limit, quarantine state, and download denial unless AVAILABLE.
- [ ] Browser-test MFA enrollment, sign-in, backup-code consumption, disable, and recovery on non-production.
- [ ] Define and test recovery when both authenticator and backup codes are lost.
- [ ] Browser-test password-reset journeys, expired/used tokens, and session revocation.
- [ ] Verify every sensitive support route enforces the approved grant.

## Guest QR feedback foundation — implemented, not yet verified
- [x] Permanent branch QR and anonymous guest-feedback data models and additive migration.
- [x] Public mobile-first feedback page and anonymous rating/comment submission.
- [x] Derive workspace/branch identity from the resolved QR record, never public request fields.
- [x] Opaque QR identifiers, active/paused/revoked lifecycle, hashed idempotency keys, and database-backed rate limiting.
- [x] Authenticated QR management, status controls, QR preview/image/print/tent controls, and branch-specific Google review URL.
- [x] Keep guest workflow separate from existing authenticated/email Feedback and FeedbackReply workflow.
- [x] Google review invitation is neutral and independent of rating; no review gating.
- [ ] Complete CI for the current PR #9 head and inspect any failures.
- [x] Added integration coverage for paused and archived QR codes, duplicate submissions, rate limiting, and cross-tenant references; CI execution remains pending.
- [x] Added integration coverage for revoked QR codes, malformed JSON, out-of-range ratings, oversized comments, and a submission waiting behind a committed QR pause.
- [ ] Add hostile-string/XSS input assertions and verify rendered guest comments remain text, not executable markup.
- [ ] Test QR scanning, print output, mobile layouts, and the complete guest journey.
- [x] Draft Prisma composite relations and migration constraints for GuestQrCode → Branch and GuestFeedback → Branch/GuestQrCode.
- [ ] Run disposable PostgreSQL migration replay and negative cross-tenant insert/update tests; do not infer success from committed code.
- [ ] Include guest tables in RLS inventory and cross-workspace tests.

## Mandatory security and release gates
- [ ] Verify Resend sender domain and complete real delivery/browser testing before enabling mandatory email verification.
- [ ] Keep signup verification enforcement disabled until sender and full journey are verified; do not lock out existing pilot users.
- [ ] Test verification expiry, resend, callback, password reset, and protected-route behavior.
- [ ] Separate Vercel Preview database credentials from Production before write-capable preview testing.
- [ ] Implement restricted non-owner runtime DB role; no superuser, table ownership, or BYPASSRLS.
- [ ] Implement transaction-scoped verified user/workspace context; route tenant queries through the scoped transaction client only.
- [ ] Review membership-policy recursion and any SECURITY DEFINER helper, fixed search_path, and EXECUTE permissions.
- [ ] Implement PostgreSQL RLS only after runtime role/context boundary exists.
- [ ] Add composite tenant foreign keys and cross-workspace insert/update rejection tests, including GuestQrCode and GuestFeedback.
- [ ] Verify pooled-connection context isolation and concurrent requests for different workspaces.
- [ ] Complete CORS, token-storage, server-side secrets, input validation, admin-route protection, and production-debugging reviews.
- [ ] Connect privacy-appropriate antivirus/malware scanner. Files remain quarantined until a durable clean verdict; size/type checks are not antivirus.
- [ ] Complete independent security review, including planned Anthropic/Claude Code review.
- [ ] Configure protected GitHub production environment with required reviewers and verify enforcement.
- [ ] Compare live PostgreSQL schema and migration history with reviewed migration chain.
- [ ] Create verified recoverable production backup and complete restore drill before any live migration.
- [ ] Configure backup encryption recipient and secure off-platform private identity/retention; test restore and monitoring.
- [ ] Obtain explicit owner approval before merge, production migration, production bootstrap, or deployment.

## Product, operations, and trust
- [ ] Complete durable Security Warden acknowledgement, assignment, investigation, resolution, and escalation delivery.
- [ ] Enforce approved scopes on every sensitive support/investigation route before enabling data access.
- [ ] Add auditable investigation exports and incident notifications.
- [ ] Complete 14-day guided pilot trial, payment verification, expiry, and conversion.
- [ ] Confirm branch/workspace permissions and conflict handling for concurrent operational edits.
- [ ] Add integrations only after authorization, data minimization, and failure/retry behavior are designed.
- [ ] Keep legal, privacy, security, subprocessor, and retention statements aligned with deployed behavior.
- [ ] Add Terms, privacy request/deletion handling, and verified company/legal identity details when supplied.
- [ ] Improve public product proof, workflow explanation, use cases, and outcome-led copy without overclaiming.

## Quality and accessibility
- [ ] Run type diagnostics, lint, Prisma validation, security tests, and production build for combined reviewed branch.
- [ ] Test 320, 375, 768, 1280, and 1440 pixel layouts; Chrome, Safari, and Firefox where available.
- [ ] Test keyboard navigation, labels, error announcements, reduced motion, and screen-reader flows.
- [ ] Verify direct loading of public, auth, invitation, platform, dashboard, and guest-feedback routes.
- [ ] Verify environment variables and provider callbacks in non-production before release.

## Explicitly not authorized
Checking off development tasks does not authorize production deployment, production migration, live database mutation, production Founder bootstrap, PR merge, or paid-domain purchase. Each requires separate review and explicit approval.
