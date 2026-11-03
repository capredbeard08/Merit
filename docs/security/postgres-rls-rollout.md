# MERIT PostgreSQL Row-Level Security rollout

**Status:** design and implementation gate only. This document does not apply database changes.

## Why this rollout is gated
The application currently uses a Prisma client created from DATABASE_URL. The repository does not yet establish a restricted runtime database role, and tenant queries are not consistently wrapped in transactions that set verified user/workspace context. Enabling policies before those pieces exist risks breaking legitimate requests or leaving the application connected as a privileged owner, making RLS ineffective.

**Do not run an RLS migration against Preview or Production until the restricted runtime role and transaction context are implemented and tested.** The runtime role must not have superuser, BYPASSRLS, table ownership, or schema ownership.

## Tenant-bearing data inventory
Existing workspace-scoped records include Workspace, Member, Branch, Customer, ServiceEvent, Feedback, Invitation, WebhookEndpoint, AuditLog, FollowUp, FeedbackReply, Insight, and FileAsset.

The guest-feedback branch adds:
- GuestQrCode — workspace/branch-owned QR configuration with an opaque public locator.
- GuestFeedback — anonymous submissions associated with a workspace, branch, and QR record.

These guest tables must be included in the final Prisma/RLS inventory and must not be treated as public tenant bypasses. Public submission is a narrowly scoped server capability, not general access to tenant records.

SecurityEvent has nullable workspaceId; define separate workspace-event and platform-event policies before including it. Authentication tables (User, Session, Account, Verification, and MFA records) need a separate narrowly scoped authentication access design.

## Required database roles
Use separate migration ownership and application runtime roles:
- Migration/owner role owns schema objects and is used only by controlled migration workflows.
- Runtime role has only required CRUD privileges, does not own tenant tables, and has neither superuser nor BYPASSRLS.
- Enable and FORCE ROW LEVEL SECURITY on tenant tables so table owners are subject to policies during ordinary access. Migration credentials remain a separately controlled exception and must never be used by web request handlers.
- Store credentials only in database/deployment secret stores.

Review role creation and grants against the hosting provider's PostgreSQL capabilities before executing SQL.

## Request context contract
1. Verify the Better Auth session in application code.
2. Resolve the requested workspace through Member(workspaceId, userId) for the authenticated user.
3. Start a Prisma interactive transaction.
4. Set transaction-local context with parameterized set_config(..., true) calls for verified user and workspace IDs. Never use unverified request parameters.
5. Execute every tenant query for that request through the transaction client only.
6. Commit/rollback; transaction-local settings must not leak through pooled connections.
7. Reject tenant queries without both context values. Never silently fall back to a privileged/global Prisma client.

Membership lookup needs a narrowly scoped bootstrap policy that lets a user read only their own membership rows. Workspace creation/invitation acceptance need dedicated flows rather than broadening normal tenant access.

## Policy model
For a tenant row with workspaceId, permit access only when transaction workspace context equals the row's workspaceId and transaction user context has a current Member row for that workspace.

Use both USING and WITH CHECK as appropriate. For Member, allow self-membership discovery while member administration remains restricted by active-workspace and application-level role checks. Never permit arbitrary self-insertion into a workspace.

RLS is defense in depth, not a replacement for application authorization. Public QR submission and webhook ingestion must use narrowly scoped, server-verified capabilities and must not receive a general tenant bypass.

## Tenant-integrity gaps
Current relationships use single-column foreign keys in several places. A record may reference a Branch, Customer, ServiceEvent, Feedback, or QR record from another workspace if application validation is missed.

Existing candidate constraints cover:
- Customer → Branch
- ServiceEvent → Branch and Customer
- Feedback → Branch, Customer, and ServiceEvent
- WebhookEndpoint → Branch
- FollowUp → Feedback
- FeedbackReply → Feedback

The guest-feedback branch adds relationships that must be enforced at database level:
- GuestQrCode → Branch within the same workspace.
- GuestFeedback → Branch within the same workspace.
- GuestFeedback → GuestQrCode within the same workspace and branch.

Extend the review-only SQL candidate and Prisma composite relation definitions after inspecting the exact schema. Run mismatch preflight queries on a disposable copy first; do not silently rewrite/delete records. Confirm PostgreSQL version support for column-list ON DELETE SET NULL (PostgreSQL 15+) and review deletion/retention semantics.

## Required automated tests
Use at least two workspaces and two users (one in both workspaces; one in only one):
- No context: tenant reads return no rows and writes fail.
- User A cannot read/update/delete User B's workspace rows.
- Changing URL/query/body IDs cannot cross workspace boundaries.
- Inserts/updates with another workspace ID fail.
- Cross-workspace foreign-key combinations fail for all existing and guest-feedback relations.
- Guest QR public IDs reveal no tenant/internal IDs and never permit general tenant reads.
- Paused/revoked QR codes and archived branches cannot accept submissions.
- Membership discovery returns only the current user's memberships.
- Rollback, connection reuse, and concurrent requests cannot leak context.
- Webhook/public-feedback paths work only with dedicated verified capabilities.
- Migration/owner credentials are unavailable to web runtime code.

## Rollout sequence
1. Inventory every Prisma query and background job by tenant context.
2. Implement and test a single transaction-scoped tenant data-access boundary; refactor tenant routes/jobs to use it.
3. Separate runtime/auth/migration credentials and verify effective grants.
4. Add composite tenant foreign keys after a read-only integrity audit.
5. Add RLS policies in a new migration on disposable PostgreSQL first.
6. Run the cross-tenant and concurrency suite using the restricted runtime role.
7. Only after explicit approval, deploy to a non-production preview isolated from Production and verify all flows.
8. Schedule Production only with reviewed backup, restore plan, migration approval, and explicit owner approval.

## Current decision
No RLS SQL migration is included in this change. Applying policies before the restricted runtime role and transaction-scoped context exist is unsafe.
