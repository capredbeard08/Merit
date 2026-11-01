# MERIT platform access foundation

## Boundary

Platform access is an identity separate from workspace membership. A user may be a workspace Owner without being a platform operator, and a platform operator does not gain access to workspace feedback, customer records, replies, uploaded files, or AI content merely by holding a platform role.

## Initial platform roles

- `FOUNDER_SUPER_ADMIN`: platform governance and controlled platform-role grants.
- `PLATFORM_ADMIN`: read-only platform operator directory and platform security visibility; cannot grant, change, or revoke platform roles.
- `ENGINEER`: technical security and deployment visibility; cannot administer users or grant platform roles.

The capability policy is explicit and fail-closed in `src/lib/platform-access.ts`. Do not infer access from email address, workspace role, account age, or client-provided metadata.

## Founder uniqueness and revocation

The database migration adds a partial unique index allowing only one active `FOUNDER_SUPER_ADMIN` assignment. Transfer requires revoking the current assignment before creating another. Revocation is represented by `revokedAt`; application checks must reject revoked records immediately.

## Implemented and remaining

- The one-time founder bootstrap endpoint is implemented on this branch. No hardcoded founder email, seed account, or automatic promotion exists.
- No platform administrator or engineer can currently grant themselves or another user access.
- A server-protected `/platform` console and operator directory are implemented. Founder Super Admin can grant or revoke `PLATFORM_ADMIN` and `ENGINEER` access for existing verified accounts. Platform Admin can view the directory but cannot grant, change, or revoke roles.
- No platform role grants access to business customer content.
- Business-approved Request Authorization, scoped read/write grants, expiry, revocation, and investigation audit exports remain a separate phase.

## Required next controls

1. **Implemented on this branch:** the initial bootstrap records a high-severity SecurityEvent with actor, target, reason, and request context; it never stores the secret or customer content. It is not ready for production until email verification is enabled/tested and edge rate limiting is configured. Remove/disable the bootstrap secret immediately after use; never expose it to client code.
2. **Implemented on this branch:** operator grants, reinstatements, and revocations are recorded as high-severity SecurityEvents in the same serializable transaction as the access change. Metadata excludes secrets and customer content.
3. Protect all platform API routes server-side with the capability policy and MFA/step-up authentication for sensitive operations.
4. Add Request Authorization before any support/investigation access to a business workspace. The grant must identify the workspace, exact resource scope, read/write mode, business approver, expiry, and revocation state.
5. Add integration tests for operator grant/revoke races, verified-account enforcement, founder protection, and unauthorized direct API calls; configure edge rate limiting and MFA/step-up for sensitive operations.
6. Validate the Prisma schema, generate the client, run the complete security suite, and run a production build before merging or deploying.

## Deployment gate

This branch includes the platform-access migration, bootstrap endpoint, operator-management API, and protected console. Do not run the migration against Preview or Production until the PR chain is reviewed, schema/client checks pass, a recoverable database backup is verified, email verification is operational, edge rate limiting and step-up authentication are configured, and the appropriate environment approvals are confirmed.
