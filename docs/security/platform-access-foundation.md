# MERIT platform access foundation

## Boundary

Platform access is an identity separate from workspace membership. A user may be a workspace Owner without being a platform operator, and a platform operator does not gain access to workspace feedback, customer records, replies, uploaded files, or AI content merely by holding a platform role.

## Initial platform roles

- `FOUNDER_SUPER_ADMIN`: platform governance and controlled platform-role grants.
- `PLATFORM_ADMIN`: platform user administration and platform security visibility; cannot grant platform roles.
- `ENGINEER`: technical security and deployment visibility; cannot administer users or grant platform roles.

The capability policy is explicit and fail-closed in `src/lib/platform-access.ts`. Do not infer access from email address, workspace role, account age, or client-provided metadata.

## Founder uniqueness and revocation

The database migration adds a partial unique index allowing only one active `FOUNDER_SUPER_ADMIN` assignment. Transfer requires revoking the current assignment before creating another. Revocation is represented by `revokedAt`; application checks must reject revoked records immediately.

## Implemented and remaining

- The one-time founder bootstrap endpoint is implemented on this branch. No hardcoded founder email, seed account, or automatic promotion exists.
- No platform administrator or engineer can currently grant themselves or another user access.
- No platform route or dashboard is exposed yet.
- No platform role grants access to business customer content.
- Business-approved Request Authorization, scoped read/write grants, expiry, revocation, and investigation audit exports remain a separate phase.

## Required next controls

1. **Implemented on this branch:** the initial bootstrap records a high-severity SecurityEvent with actor, target, reason, and request context; it never stores the secret or customer content. It is not ready for production until email verification is enabled/tested and edge rate limiting is configured. Remove/disable the bootstrap secret immediately after use; never expose it to client code.
2. Record every subsequent role grant/revocation as a platform SecurityEvent with actor, target, reason, and request context; never store secrets or customer content in event metadata.
3. Protect all platform API routes server-side with the capability policy and MFA/step-up authentication for sensitive operations.
4. Add Request Authorization before any support/investigation access to a business workspace. The grant must identify the workspace, exact resource scope, read/write mode, business approver, expiry, and revocation state.
5. Add tests for bootstrap races, second-founder rejection, role revocation, session invalidation, cross-workspace denial, and unauthorized direct API calls.
6. Validate the Prisma schema, generate the client, run the complete security suite, and run a production build before merging or deploying.

## Deployment gate

This branch adds a migration file only. Do not run it against Preview or Production until the PR chain is reviewed, the schema/client checks pass, a recoverable database backup is verified, and the appropriate environment approvals are confirmed.
