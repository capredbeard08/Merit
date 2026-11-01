# MERIT Development Work — Review Record
**Review date:** 1 November 2026  
**Repository:** `capredbeard08/Merit`  
**Pull request:** [#8 — Add isolated platform access foundation](https://github.com/capredbeard08/Merit/pull/8)  
**Working branch:** `feat/platform-access-foundation`  
**Base branch:** `feat/explicit-workspace-selection`  
**Recorded head commit at review:** `ec931065056b74bc1e1893877b478c7db42d6d5e`

> **Review status: NOT READY TO MERGE OR DEPLOY.** This record documents code committed to a development branch. It is not a claim that the work is production-ready, fully tested, or deployed.

## 1. Executive summary

The current development increment establishes a separate platform-operator identity and a business-controlled support-authorization workflow for MERIT.

The central security boundary is intentional: a MERIT platform role does not automatically provide access to a business workspace's customers, feedback, replies, uploaded files, or AI content. A platform operator must request a narrow, read-only permission from that workspace. An authorised business Owner or Admin must approve it, and the permission expires or can be revoked.

The branch also contains a Founder Super Admin bootstrap route, operator management, a protected platform console, a platform security-event feed, and a Founder-only CSV export.

## 2. Platform roles and permissions

A new `PlatformAccessRole` enum and `PlatformAccess` model were added. Platform access is separate from the existing workspace `Member` role.

| Platform role | Intended capabilities |
|---|---|
| Founder Super Admin | Full platform-console governance, including granting/revoking Platform Admin and Engineer roles and exporting platform audit events |
| Platform Admin | Read the platform operator directory and platform security events; cannot grant or revoke platform roles |
| Engineer | Read platform security events and deployment visibility; cannot administer platform users or export audit CSV |

The capability policy in `src/lib/platform-access.ts` is explicit and fails closed for missing, revoked, or unknown access records. These roles do not themselves confer business-data access.

## 3. Founder Super Admin bootstrap

Added `POST /api/platform/bootstrap`.

The route requires:
- An authenticated Better Auth session.
- A verified email address.
- A same-origin request.
- JSON input with a strict schema.
- A deployment-only `FOUNDER_BOOTSTRAP_SECRET` with at least 32 bytes.
- No previous Founder Super Admin assignment, including a revoked one.
- No existing platform-access record for the requesting account.

The grant and its high-severity platform security event are written in a serializable database transaction. The database migration also creates a partial unique index so only one active Founder Super Admin can exist.

Operational documentation is in `docs/security/founder-bootstrap.md`. The bootstrap secret must be removed from the deployment environment immediately after a successful bootstrap. The route is not ready for production until email verification is enabled and tested, rate limiting and step-up authentication are configured, and the migration has passed review.

## 4. Platform operator console and management

Added a protected `/platform` page and the platform operator API.

Founder Super Admin can grant, reinstate, and revoke `PLATFORM_ADMIN` and `ENGINEER` access for existing registered accounts whose email addresses are verified. The endpoint does not provide a way to create or transfer Founder Super Admin access.

The operator directory is limited to 100 records in its current implementation. Platform role changes are recorded as high-severity platform security events in the same transaction as the change.

## 5. Platform security event feed and CSV export

Added `GET /api/platform/security-events` and the platform security-events interface.

The feed is designed to expose only allow-listed platform-level events with `workspaceId = null`; it does not return workspace audit history or customer content. It supports severity/type filters and cursor pagination.

Founder-only CSV export is capped at 500 matching records per request. Metadata is allow-listed and CSV cells are quoted and protected against common spreadsheet formula injection. The response is marked no-store.

The current allow-list includes founder bootstrap, platform-access grant/reinstatement/revocation, and support-access request/approval/denial/revocation events.

## 6. Business-controlled support authorization

This is the latest functional increment.

### Request rules
A platform operator with the required platform capability can request one of four exact read-only scopes:
- `CUSTOMER_RECORDS_READ`
- `FEEDBACK_READ`
- `FEEDBACK_REPLIES_READ`
- `FILE_ASSETS_READ`

Each request:
- Identifies one workspace.
- Requires a reason between 20 and 500 characters.
- Requests one of four durations: 30, 60, 120, or 240 minutes.
- Expires if not reviewed within 24 hours.
- Is blocked if a matching pending request or active grant already exists for that operator, workspace, and scope.

### Business controls
Workspace Owners and Admins can see requests for their own workspace and approve, deny, or revoke them. The requester cannot approve their own request. The operator can cancel a pending request or revoke their own approved access.

An approval is bound to the requesting operator, one workspace, one resource scope, and a time limit. It does not grant write access. Business decisions and operator actions are recorded in workspace audit history and platform security events.

### Guard for future support data routes
Added `withApprovedSupportRead` and `executeApprovedSupportReadInTransaction` in `src/lib/support-access.ts`, alongside the pure grant policy in `src/lib/support-access-policy.ts`. The transaction-scoped helper checks active platform access and the exact workspace/operator/scope grant, runs the caller's data query, and writes the access-use audit record inside one serializable transaction. A future endpoint must use this helper and its callback must constrain every returned row to the requested workspace and scope. Serialization conflicts must fail closed; callers must not fall back to an unguarded query.

**Important limitation:** this increment does not add a general-purpose endpoint that displays customer or feedback data to support staff. The authorization workflow and transaction-scoped guard exist; individual data-view routes still need to be implemented and reviewed one by one. The integration test exercises the transaction-scoped guard against the CI database, not a production support-data endpoint.

## 7. User-interface changes

- Added the support-request form and request history to the platform console.
- Added the business-side Support Access Approvals panel to the workspace dashboard for members with the `members:manage` permission.
- Added the workspace ID to the dashboard's workspace-management section so an operator can identify the workspace when submitting a request.
- Added status, expiry, decision-maker, cancellation, and revocation information to the relevant views.

## 8. Database and migration changes

The Prisma schema now includes:
- `PlatformAccessRole`
- `SupportAccessScope`
- `SupportAccessStatus`
- `PlatformAccess`
- `SupportAccessRequest`

Two SQL migrations were added:
1. `20261101010000_platform_access_foundation`
2. `20261101020000_business_support_authorization`

The migrations add platform role storage, the one-active-founder constraint, support request storage, status/scope fields, duration validation, indexes, and foreign-key relationships.

**Neither migration has been run against the live MERIT database.** No live account deletion, customer-data deletion, production database mutation, or production deployment was performed as part of this work.

## 9. Tests and validation — actual result

The CI workflow was updated to run on pushes to `main` and `feat/platform-access-foundation`, and on pull requests targeting `main` or `feat/explicit-workspace-selection`.

An earlier run exposed TypeScript response-narrowing errors in platform API routes and a nullable support-access grant in `src/lib/support-access.ts`. Subsequent changes addressed the reported issues, and the recorded successful CI run passed the TypeScript check. A later guard explicitly checks that the support grant exists before accessing its ID.

**Latest verified CI result: PASSED** — GitHub Actions run [#199](https://github.com/capredbeard08/Merit/actions/runs/41339143548), for commit `ec931065056b74bc1e1893877b478c7db42d6d5e`:
- Dependency installation: passed.
- Prisma schema validation: passed.
- Prisma Client generation: passed.
- Full migration chain applied to disposable PostgreSQL 16: passed.
- Database-backed support authorization integration test: passed — 1 test, 0 failures. It covers the request/approval/revocation lifecycle, exact workspace/scope binding, audit writes, and fail-closed behavior of the transaction-scoped read guard.
- Security and policy suite: passed — 35 tests, 0 failures, including the shared decision policy used by the workspace support-access API.
- TypeScript check: passed.
- Production build: passed.

The disposable PostgreSQL service uses CI-only credentials and is destroyed after the job. This validates migration execution and the tested transaction behavior in a clean CI database; it does not validate the live database's current state, create a backup, or apply migrations to the live MERIT database. No live database mutation or production deployment occurred.
### Further tests still needed
- Direct HTTP/API integration tests for support request creation, business approval/denial, self-approval rejection, requester cancellation, and business revocation.
- Cross-workspace isolation and direct API authorization tests against real route handlers and authenticated sessions.
- Concurrent approval/revocation tests to validate serialization-conflict handling; the transaction-scoped read guard is in place, but this concurrency scenario still needs an explicit integration test.
- Founder bootstrap and operator grant/revoke integration tests.
- End-to-end email verification and account recovery checks.
- Migration-diff review against the live database's migration history and schema.
- Review migration ordering against the prerequisite security PR chain.

A passing unit-test suite and production build are a meaningful milestone, but do not establish production readiness or prove every authorization path end-to-end.

## 10. Security controls not yet completed

The following are not represented as completed:
- Better Auth email verification is not yet enabled and end-to-end tested.
- MFA or step-up authentication for sensitive platform actions.
- Edge/API rate limiting for bootstrap and privileged endpoints.
- Actual support data-view routes individually wired to the approval guard.
- A full security review and end-to-end tests.
- A verified recoverable database backup.
- Production migration, merge, and deployment approval.

The database backup issue remains unresolved because the available Prisma backup option requires a paid-plan upgrade and no existing automatic snapshot was available when checked. No backup has been fabricated or assumed.

## 11. Files added or changed in this increment

### Database and migrations
- `prisma/schema.prisma`
- `prisma/migrations/20261101010000_platform_access_foundation/migration.sql`
- `prisma/migrations/20261101020000_business_support_authorization/migration.sql`

### API routes
- `src/app/api/platform/bootstrap/route.ts`
- `src/app/api/platform/operators/route.ts`
- `src/app/api/platform/security-events/route.ts`
- `src/app/api/platform/support-requests/route.ts`
- `src/app/api/platform/support-requests/[requestId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/support-access/route.ts`

### Platform and dashboard UI
- `src/app/platform/page.tsx`
- `src/app/platform/platform-accounts-manager.tsx`
- `src/app/platform/platform-security-events.tsx`
- `src/app/platform/platform-support-requests.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/support-access-approvals.tsx`

### Security and policy helpers/tests
- `src/lib/founder-bootstrap.ts`
- `src/lib/founder-bootstrap.test.ts`
- `src/lib/platform-access.ts`
- `src/lib/platform-access.test.ts`
- `src/lib/platform-admin.ts`
- `src/lib/platform-security-events.ts`
- `src/lib/platform-security-events.test.ts`
- `src/lib/support-access.ts`
- `src/lib/support-access-policy.ts`
- `src/lib/support-access.test.ts`

### Documentation and workflow
- `docs/security/founder-bootstrap.md`
- `docs/security/platform-access-foundation.md`
- `.github/workflows/ci.yml`
- `package.json`

The pull request currently reports 29 changed files, 2,260 additions, and 3 deletions relative to its declared base branch.

## 12. Review checklist

Please review these decisions before the next development step:

- [ ] Keep Founder Super Admin as a one-time, separately bootstrapped role.
- [ ] Keep Platform Admin and Engineer unable to grant or revoke platform roles.
- [ ] Keep platform roles separate from workspace membership and customer-data permissions.
- [ ] Keep support authorization read-only, scope-specific, time-limited, and business-approved.
- [ ] Confirm whether the four support scopes are the right initial boundaries.
- [ ] Confirm whether workspace Owners and Admins should both be allowed to approve.
- [ ] Confirm the four-hour maximum grant duration and 24-hour request expiry.
- [x] Resolve the previously reported TypeScript failures; the recorded CI run passed TypeScript and production build.
- [x] Verify explicit Prisma validation and the full migration chain against disposable PostgreSQL in CI run #165.
- [x] Add a database-backed support lifecycle and transaction-scoped read-guard integration test.
- [ ] Add direct HTTP/API integration tests for approval, denial, self-approval, expiry, revocation, and cross-workspace isolation.
- [ ] Do not run migrations or deploy until a recoverable backup and all deployment gates are satisfied.

## 13. Current status

**Development branch:** includes the platform-access foundation, business support authorization, database-backed lifecycle coverage, a transaction-scoped support read guard, explicit Prisma validation, and disposable PostgreSQL migration validation.  
**Branch head:** `ec931065056b74bc1e1893877b478c7db42d6d5e`.  
**Pull request:** [#8](https://github.com/capredbeard08/Merit/pull/8), open and marked draft.  
**Latest verified CI run:** [#199](https://github.com/capredbeard08/Merit/actions/runs/41339143548) passed all steps: Prisma validation, Prisma Client generation, full migration deployment to disposable PostgreSQL 16, 1 database-backed integration test, 35 security/policy tests, TypeScript, and production build.  
**Database migrations:** inspected and successfully exercised in ephemeral CI only; not applied to the live database.  
**Live database and accounts:** not modified by this development increment.  
**Production deployment:** not performed.

**Release status: NOT READY TO MERGE OR DEPLOY.** Direct HTTP/API authorization integration tests, email verification, rate limiting, MFA/step-up authentication, verified recoverable backup, migration-history review, and remaining security gates are still outstanding.

This is a review document, not a release approval.
