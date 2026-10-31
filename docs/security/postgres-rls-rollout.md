# MERIT PostgreSQL Row-Level Security rollout

Status: design and implementation gate only. This document does not apply database changes.

## Why this is a gated rollout

The application currently uses one Prisma client created from `DATABASE_URL`. The repository does not yet establish a restricted runtime database role, and normal Prisma calls are not consistently wrapped in transactions that set a verified user/workspace context. Enabling tenant policies before those two pieces exist would either break legitimate requests or tempt the app to keep using a privileged owner connection, which would make the protection ineffective.

**Do not run an RLS migration against Preview or Production until the runtime role and transaction context are deployed and tested.** Do not grant the runtime role BYPASSRLS, superuser, table ownership, or schema ownership.

## Tenant-bearing tables identified in Prisma

Workspace-scoped records:
- `Workspace` (read only through a membership)
- `Member` (a user may read their own memberships; member administration is workspace-scoped)
- `Branch`
- `Customer`
- `ServiceEvent`
- `Feedback`
- `Invitation`
- `WebhookEndpoint`
- `AuditLog`
- `FollowUp`
- `FeedbackReply`
- `Insight`
- `FileAsset`

`SecurityEvent` has a nullable `workspaceId`; it needs a deliberate policy for workspace events versus platform-wide events before it is included. Authentication tables (`User`, `Session`, `Account`, `Verification`) are not tenant tables and need a separate narrowly scoped authentication access design.

## Required database roles

Use separate, non-login migration ownership and application runtime roles:
- A migration/owner role owns schema objects and is used only by controlled migration workflows.
- An application runtime role has only the required CRUD privileges, does not own tenant tables, and has neither superuser nor BYPASSRLS.
- Enable and FORCE ROW LEVEL SECURITY on tenant tables so table owners are also subject to policies during ordinary access. The migration owner remains a separately controlled exception and must never be used by web request handlers.
- Keep credentials in the database provider and deployment secret stores; never commit them or paste them into chat.

The actual role creation/grants must be reviewed against the hosting provider's Postgres capabilities before any SQL is executed.

## Request context contract

1. Verify the Better Auth session in application code.
2. Resolve the requested workspace by querying `Member(workspaceId, userId)` for the authenticated user.
3. Start a Prisma interactive transaction.
4. Set transaction-local context with parameterized `set_config(..., true)` calls for the verified user ID and workspace ID. Never set context from an unverified request parameter.
5. Perform every tenant data query for that request through the transaction client only.
6. Commit/rollback; transaction-local settings must not leak through pooled connections.
7. Reject tenant queries without both context values. Do not silently fall back to a privileged/global Prisma client.

The membership lookup itself needs a carefully scoped bootstrap policy that permits a user to read only their own `Member` rows. Workspace creation/invitation acceptance require dedicated, narrowly scoped flows rather than broadening normal tenant access.

## Policy model

For a tenant row with `workspaceId`, permit access only when:
- the transaction's workspace context equals the row's `workspaceId`; and
- the transaction's user context has a current `Member` row for that workspace.

Use both `USING` and `WITH CHECK` for update/delete and insert/update respectively. Apply equivalent policies to `Workspace` via membership. For `Member`, allow a user to select their own membership rows for workspace discovery; allow member management only under the verified active workspace and an application-level role check. Do not permit a user to insert themselves into an arbitrary workspace.

RLS is defense in depth, not a replacement for application authorization. Public feedback submission and webhook ingestion must use narrowly scoped, server-verified capabilities and should not receive a general tenant bypass.

## Integrity gaps to close alongside RLS

The current schema has single-column foreign keys for several tenant relationships. A record could potentially reference a Branch, Customer, or ServiceEvent belonging to a different workspace if application validation is missed. Add composite unique keys and composite foreign keys that include `workspaceId` for:
- Customer -> Branch
- ServiceEvent -> Branch and Customer
- Feedback -> Branch, Customer, and ServiceEvent
- WebhookEndpoint -> Branch
- FollowUp -> Feedback
- FeedbackReply -> Feedback

Check existing data for mismatched tenant relationships before adding constraints. Do not silently rewrite or delete records. A non-executable review candidate with mismatch queries and proposed PostgreSQL DDL is in `docs/security/composite-tenant-keys-review.sql`. It is deliberately outside `prisma/migrations/`; it is not approved for execution. The current Prisma schema still needs corresponding composite relation definitions and generated-client validation before this candidate can become a real migration. Confirm PostgreSQL server support for column-list `ON DELETE SET NULL` (PostgreSQL 15+) used to preserve `workspaceId` when an optional branch link is removed.

## Required automated tests before rollout

Use two workspaces and at least two users (one user in both workspaces; one user in only one):
- No context: tenant reads return no rows and writes fail.
- User A cannot read, update, or delete User B's workspace rows.
- A member of Workspace A cannot access Workspace B by changing a URL/query/body ID.
- Insert/update cannot write a row with another workspace ID.
- Cross-workspace foreign-key combinations fail.
- Membership discovery returns only the current user's memberships.
- Transaction rollback and connection reuse do not leak context.
- Concurrent requests for different workspaces cannot see each other's context.
- Webhook/public-feedback paths work only with their dedicated verified capability.
- Migration/owner credentials are unavailable to web runtime code.

## Rollout sequence

1. Inventory and classify every Prisma query and background job by tenant context.
2. Implement and test a single transaction-scoped tenant data-access boundary; refactor tenant routes/jobs to use it.
3. Separate runtime/auth/migration database credentials and verify effective grants.
4. Add composite tenant foreign keys after a read-only integrity audit.
5. Add RLS policies in a new migration on a disposable test database first.
6. Run the complete cross-tenant and concurrency suite against the restricted runtime role.
7. Deploy to Preview only after CI passes; verify signup, dashboard, webhook, files, and feedback flows.
8. Schedule Production only with a reviewed backup, restore plan, migration approval, and explicit owner approval.

## Current decision

No RLS SQL migration is included in this change. This is intentional: applying policies before the restricted role and transaction-scoped context exist is not safe.
