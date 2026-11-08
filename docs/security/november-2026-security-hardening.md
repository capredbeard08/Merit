# MERIT November 2026 Security Hardening

**Working branch:** feat/platform-access-foundation  
**Status:** Development and CI evidence only. Not a production security certification.

## Implemented in the current platform-access branch

### Platform roles and privileged actions
- Platform roles are separate from workspace membership: Founder Super Admin, read-only Platform Admin, and Engineer.
- Platform capabilities fail closed. Platform roles do not grant business customer-data access.
- Founder-only operator grants, reinstatements, and revocations apply to existing verified accounts; ordinary operator controls cannot manage the Founder role.
- Privileged changes and security-event records are committed together.
- Platform security-event feed and capped Founder-only CSV export use metadata allow-lists and formula-injection protection.
- Privileged platform actions use database-backed fixed-window rate limits and fail closed if the limiter is unavailable.
- Founder bootstrap and operator changes require enrolled MFA and a session created within the preceding 10 minutes.

### Authentication and recovery
- Added password-reset templates and forgot/reset-password pages.
- Reset requests use generic confirmation to avoid account enumeration.
- Password-reset tokens expire after one hour and successful reset revokes sessions.
- Email delivery is deferred with Next.js after() and uses token-derived idempotency keys.
- **Email verification remains intentionally unenforced.** Automatic verification email sending and requireEmailVerification remain disabled so existing pilot users are not locked out while the sender and complete journey are unverified.

Outstanding: sender-domain verification, real Resend delivery, browser tests for reset/verification expiry and resend, callback behavior, protected-route enforcement, and account recovery support.

### Authenticator-based MFA
- Added Better Auth TOTP support, Prisma storage, encrypted backup-code storage, enrollment/settings at /dashboard/security, and challenge at /two-factor.
- Users can authenticate with a TOTP code or single-use backup code.
- CI includes a real Better Auth TOTP enrollment/verification integration test.
- Privileged Founder/operator actions fail closed without enrolled MFA and a fresh session.

Outstanding: browser-test enrollment, sign-in challenge, backup-code consumption, disable flow, and recovery on a non-production environment. Define and test recovery if both authenticator and backup codes are lost. Do not bootstrap the production Founder account before this is complete.

### File upload quarantine
- Upload completion reads authoritative private Blob metadata.
- Empty/unverifiable sizes fail closed; uploads above 50 MiB are deleted and logged as high severity.
- Downloads are allowed only for records explicitly marked AVAILABLE.
- New uploads remain QUARANTINED.

**Critical limitation:** no antivirus engine is connected. Type/header and size checks are not malware scanning. Keep files quarantined and unavailable until a privacy-appropriate scanner inspects the full object and a durable clean verdict is recorded. Do not send private business files to public malware-analysis services.

## CI evidence and branch status
PR #8 code head `b41f706` passed MERIT CI run #397. PR #9 code head `a2b7e5c` passed MERIT CI run #413. Run #413 completed Prisma schema validation/client generation, disposable PostgreSQL migration replay, database-backed support authorization and guest-feedback integration tests, Security Warden tests, TypeScript type-check, and production build. Earlier run #373 was cancelled and is not used as evidence.

The CI pull-request base-branch filter now includes `feat/platform-access-foundation`, the target branch of PR #9. PR #9 also has a push trigger for `feat/guest-feedback-foundation`. These CI results validate the code at the stated SHAs; documentation-only commits followed, so repeat CI after any material code change. Do not infer browser/mobile or production readiness from CI or prior Vercel previews.

The guest-feedback draft contains composite Prisma relations, matching migration constraints, route-level row locking/rechecks, optimistic concurrency for QR status changes, sanitized rate-limit event logging, and database-backed integration tests. These passed automated CI at code head `a2b7e5c`; RLS/runtime separation and real-device acceptance remain outstanding.

Both pull requests remain draft and unmerged. CI is not a substitute for browser verification, production configuration checks, or owner approval.

## Database and release safety
- No live database migration is authorized or implied.
- Compare live _prisma_migrations history and actual schema with the reviewed branch migration chain before proposing any live migration.
- A verified, recoverable production backup and successful restore drill are mandatory before a live migration.
- Keep migration ownership separate from application runtime credentials.
- Do not run destructive SQL, reset production, or use direct cascade delete as a substitute for an approved lifecycle.
- Preview and Production databases must be isolated before write-capable preview testing.
- Preview deployment automation has been requested disabled during this review period, but the project setting still needs independent verification.

## Remaining release gates
1. Verify sender-domain configuration and complete real email delivery, verification, and password-reset browser journeys.
2. Test MFA enrollment, sign-in, backup-code use, and recovery on a non-production deployment.
3. Connect and test privacy-appropriate malware scanning; quarantine on provider failure, timeout, unknown verdict, or mismatch.
4. Establish a restricted non-owner runtime database role and transaction-scoped verified tenant context.
5. Close composite tenant-integrity gaps and implement/test PostgreSQL RLS only after the runtime boundary exists.
6. Include guest QR and guest-feedback tables in tenant-isolation and RLS review.
7. Complete CORS, token-storage, secret-handling, input-validation, privileged-route, and production-debugging reviews.
8. Verify protected GitHub production environment approvals, live migration history/schema, recoverable backup, and restore drill.
9. Obtain explicit owner approval before merge, migration, Founder bootstrap, or deployment.

A passing CI build does not prove any of these release gates have been completed.
