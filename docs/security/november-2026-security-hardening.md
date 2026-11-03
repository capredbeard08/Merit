# MERIT November 2026 Security Hardening

**Working branch:** `feat/platform-access-foundation`  
**Status:** Development work only. This document does not certify production readiness.

## Completed in this development increment

### Authentication email and recovery
- Added a password-reset email template with escaped link content and a clear one-hour expiry notice.
- Added `/forgot-password` and `/reset-password` pages, linked the request page from sign-in, and used generic request confirmation text to avoid disclosing whether an account exists.
- Configured Better Auth password-reset tokens to expire after one hour.
- Enabled session revocation after a successful password reset.
- Added token-derived idempotency keys to verification and password-reset email delivery.
- Deferred auth email delivery with Next.js `after()` to avoid making account-existence timing differences visible in the request response.
- Kept automatic verification email sending disabled and `requireEmailVerification: false`. Existing pilot users must not be locked out before the sender and end-to-end journey are verified.

**Not yet verified:** real Resend delivery, sender-domain verification, reset-link browser journey, expired/used-token handling in the deployed environment, and account recovery support process.

### Authenticator-based MFA
- Added Better Auth's TOTP two-factor plugin and client plugin.
- Added Prisma storage for `twoFactorEnabled` and the `TwoFactor` record.
- Configured encrypted backup-code storage.
- Added an authenticator enrollment screen at `/dashboard/security`, linked from the dashboard navigation, with persisted enrollment status and password-confirmed disable control.
- Added a second-factor challenge screen at `/two-factor`; users can use a TOTP code or a single-use backup code.
- Kept the TOTP plugin enabled in CI while disabling only the external reCAPTCHA plugin, and added a real Better Auth TOTP enrollment/verification integration test using a generated current code.
- Required enrolled MFA in addition to the existing 10-minute fresh-session check for Founder bootstrap and platform operator grant/revoke actions.
- Kept the platform actions fail-closed when MFA is not enabled.

TOTP uses an authenticator app and does not require a paid email or SMS provider. The setup URI contains a secret and must be treated as confidential. Backup codes are shown during enrollment and must be stored securely by the user.

**Not yet verified:** real enrollment/sign-in/backup-code journeys against the exact Better Auth 1.7.8 runtime and a browser session. Do not bootstrap the production Founder account until the complete flow has passed on a non-production deployment and the account's recovery method has been confirmed.

### File upload quarantine and malware-scanning preparation
- The upload-completion callback now reads authoritative private Blob metadata rather than trusting the browser-reported byte count.
- Empty or unverified sizes fail closed.
- Uploads above the 50 MiB limit are deleted and recorded as high-severity security events.
- File download now allows only records explicitly marked `AVAILABLE`; unknown and future states are denied.
- Newly uploaded assets remain `QUARANTINED`.

**Important:** no antivirus engine is connected yet. Header/type checks and authoritative size checks are not malware scanning. Do not mark quarantined files `AVAILABLE` until a real scanner has inspected the full object and the clean result has been durably recorded. Do not upload private business files to public malware-analysis services.

## Database and release safety

- New 2FA schema changes are additive: a boolean on `User`, a `TwoFactor` table, a unique user relation, and a cascading foreign key.
- The full migration chain must pass in disposable PostgreSQL CI before review.
- No live database migration has been performed by this increment.
- No production deployment or merge has been performed.
- A verified, recoverable production backup and a successful restore drill remain mandatory before any live migration.
- Compare the live `_prisma_migrations` history and actual schema with the branch migration chain before proposing a deployment.
- Keep migrations additive and reviewed. Do not run destructive SQL, reset production, or use a direct cascade delete as a substitute for the approved lifecycle.

## Remaining gates

1. Complete and browser-test the password-reset and email-verification journeys after the sender domain is available.
2. Test MFA enrollment, sign-in challenge, backup-code consumption, and recovery on a non-production deployment.
3. Connect and test a privacy-appropriate malware scanner; retain quarantine on provider failure, timeout, unknown verdict, or mismatch.
4. Verify a production database backup can be restored, then review live migration history/schema.
5. Complete the remaining RLS, CORS, token-storage, route authorization, secret-handling, and independent security-review work.
6. Obtain explicit approval before merging, migrating, or deploying.

A passing CI build is necessary but is not evidence that any of these production gates have been completed.
