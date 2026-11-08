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
- A platform-only security event feed is implemented at `GET /api/platform/security-events`, with severity/type filters and cursor pagination. It queries only allow-listed platform event types with `workspaceId: null`; workspace audit history and customer records are excluded.
- Founder-only CSV export is available through the same endpoint using `format=csv`. Exported metadata is allow-listed, CSV formula injection is neutralized, and responses are marked no-store. Export is capped at 500 most recent matching records per request.
- No platform role grants access to business customer content.
- Business-approved read-only Support Authorization request, approval, denial, expiry, and revocation workflows are implemented. Actual support data-view routes remain disabled until each route is explicitly wired through the authorization guard.

## Required next controls

1. **Implemented on this branch:** the initial bootstrap records a high-severity SecurityEvent with actor, target, reason, and request context; it never stores the secret or customer content. It is not ready for production until email verification is enabled/tested and edge rate limiting is configured. Remove/disable the bootstrap secret immediately after use; never expose it to client code.
2. **Implemented on this branch:** operator grants, reinstatements, and revocations are recorded as high-severity SecurityEvents in the same serializable transaction as the access change. Metadata excludes secrets and customer content.
3. Protect all platform API routes server-side with the capability policy; the security feed is read-only for Platform Admin and Engineer, while CSV export is Founder-only. Sensitive operations require a recent Better Auth session issued after verified TOTP enrollment, so an already-open pre-enrollment session cannot satisfy MFA step-up. Password sign-in for MFA-enabled accounts must complete the TOTP challenge before Better Auth issues that session. Edge rate limiting remains a deployment prerequisite.
4. **Implemented on this branch:** platform operators can request one of four read-only scopes: customer records, feedback, feedback replies, or uploaded files. Requests require a 20–500 character reason, a 30/60/120/240-minute duration, and expire if not reviewed within 24 hours. Duplicate pending or currently active requests for the same operator/workspace/scope are rejected.
5. **Implemented on this branch:** workspace Owners and Admins can review requests in the business dashboard, approve, deny, or revoke active grants. The requester cannot approve their own request. The requester can also cancel a pending request or revoke their own approved access.
6. **Implemented on this branch:** approvals are bound to one workspace, one resource scope, one operator, read-only access, and a maximum four-hour expiry. Revocation and expiry are checked server-side. Requests, decisions, revocations, and each guarded support read are recorded in the workspace audit log; request/decision events are also recorded in the platform security event feed.
7. **Guard requirement:** every future support route that returns business data must call `requireApprovedSupportRead` with the exact workspace and scope immediately before the query, and the data query itself must remain constrained to that workspace. The helper writes a workspace audit event for each use. Do not create a generic unscoped support endpoint. No support data-view route is enabled by this increment.
8. Add integration tests for request creation, self-approval denial, workspace isolation, expiry, revocation races, and unauthorized direct API calls.
9. Add integration tests for operator grant/revoke races, verified-account enforcement, founder protection, unauthorized direct API calls, pre-enrollment-session rejection, and fresh TOTP-challenged session acceptance; configure edge rate limiting.
10. Validate the Prisma schema, generate the client, run the complete security suite, and run a production build before merging or deploying.

## Deployment gate

This branch includes the platform-access migration, bootstrap endpoint, operator-management API, and protected console. Do not run the migration against Preview or Production until the PR chain is reviewed, schema/client checks pass, a recoverable database backup is verified, email verification is operational, edge rate limiting and step-up authentication are configured, and the appropriate environment approvals are confirmed.
