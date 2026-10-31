# Tenant Route Audit

Status: preliminary audit on `feat/explicit-workspace-selection`  
Date: 2026-10-31  
Scope: inventory and targeted source review only. No database migrations, credential changes, production settings, or deployment actions.

## Why this audit exists

The workspace selector and `withTenantDb` helper establish a safer foundation, but tenant-facing routes still use the global Prisma client. The helper is not yet wired into these routes, so PostgreSQL row-level security (RLS) is not currently enforcing tenant boundaries for application queries.

This document separates confirmed observations from routes that still require source review. It is not a claim that the application is RLS-ready.

## Confirmed observations from source review

| Route | Current access pattern | Finding / next action |
|---|---|---|
| `GET /api/branches` | Auth session, explicit membership lookup, role check, workspace-filtered query via global Prisma | Application-level workspace filter is present. Convert membership and branch query to the approved tenant transaction when the route migration is implemented. |
| `POST /api/branches` | Auth session, explicit membership lookup, role check, create includes submitted workspace ID | Application-level checks are present. Tenant transaction and database-enforced isolation remain outstanding. |
| `PATCH /api/branches/[id]` | Membership check, workspace-scoped existence lookup, then update by branch ID via global Prisma; audit write separately | Keep the workspace predicate on the mutation itself (e.g. updateMany with both ID and workspace ID, or an equivalent composite key). A prior scoped read followed by an unscoped update is weaker under concurrency and future policy changes. Make the mutation and audit behavior deliberately consistent. |
| `DELETE /api/branches/[id]` | Membership check, scoped existence lookup, then update by ID via global Prisma; audit write separately | Same mutation-predicate concern as PATCH. |
| `GET /api/feedback` | Auth session, explicit membership and role checks, query filtered by workspace ID via global Prisma | Application-level filter is present; RLS enforcement is not yet connected. |
| `GET /api/files` | Auth session, membership and role checks, query filtered by workspace ID via global Prisma | Application-level filter is present; RLS enforcement is not yet connected. |
| `POST /api/invitations` | Auth session, membership and role checks, invitation writes carry workspace ID; user lookup is global by email | Global user lookup is identity-level, not tenant data. Invitation writes still need tenant-scoped transaction enforcement. Audit write currently happens separately. |
| `GET/POST /api/members` | Membership helper, role check, workspace-filtered membership reads/writes; user lookup global by email | Workspace predicates are present. Membership management is security-sensitive and needs careful policy design; do not treat Member as an ordinary tenant table. |
| `GET /api/insights` | Selects the user's oldest membership with `findFirst`, then reads insights for that workspace | **Confirmed workspace-selection defect:** the endpoint ignores the active workspace and silently chooses the oldest membership. Change contract to require an explicit workspace ID and validate membership/role for that exact workspace. |
| `GET /api/security/events` | Auth session, explicit membership and role checks, workspace-filtered event query and groupBy via global Prisma | Application-level filters are present; ensure both queries execute under the same tenant transaction after RLS is introduced. |
| `POST /api/follow-ups/process` | Cron-secret authentication; global worker scans queued jobs across workspaces and updates follow-ups and feedback | Cross-tenant worker by design. It needs a dedicated, tightly scoped worker role/capability and per-workspace transaction context. Do not expose this worker to ordinary tenant runtime credentials. |

## Remaining route inventory

These paths were present in the branch tree but were not fully source-reviewed in this pass. Each requires a deliberate classification before RLS rollout:

- `/api/branches/[id]/restore`
- `/api/feedback/[id]`
- `/api/feedback/[id]/click`
- `/api/feedback/[id]/optout`
- `/api/files/[id]`
- `/api/files/[id]/erase`
- `/api/files/[id]/restore`
- `/api/files/upload`
- `/api/insights/generate`
- `/api/integrations/webhook`
- `/api/invitations/accept`
- `/api/public/feedback/[id]`
- `/api/replies`
- `/api/webhooks/service-completed`
- `/api/workspaces`
- `/api/workspaces/[workspaceId]`
- `/api/auth/[...all]`
- `/api/health`

## Required classifications before RLS

1. **Authenticated tenant requests:** derive the user ID only from the verified server session; validate membership and role for the exact requested workspace; execute tenant reads and writes through a transaction carrying trusted tenant context.
2. **Public feedback capability:** scope access to a verifiable feedback token/capability and the exact feedback record. Never grant a public endpoint a general tenant bypass.
3. **Inbound webhooks:** verify provider signatures/secrets and bind the event to a known integration/workspace before any tenant data access.
4. **Invitation acceptance:** treat invitation token validation and membership creation as a narrowly scoped bootstrap flow; prevent token replay and cross-workspace substitution.
5. **Background jobs:** authenticate the scheduler/worker separately, claim jobs safely, and process each tenant's records with an explicit workspace context.
6. **Authentication/system tables:** User, Session, Account, and Verification need a separate access strategy; they must not inherit broad tenant policies.
7. **Audit/security events:** define whether each record is workspace-owned, system-wide, or nullable-workspace before writing policies.

## Safe rollout prerequisites

- Confirm all tenant query paths and background jobs have been reviewed.
- Ensure tenant mutations include workspace scope at the mutation itself, not only in a preceding read.
- Use a restricted runtime database role without superuser or BYPASSRLS privileges.
- Keep migration ownership separate from application runtime credentials.
- Add cross-workspace negative tests for reads, updates, deletes, relation traversal, and bulk operations.
- Add tests for public tokens, webhook signatures, invitation acceptance, and worker isolation.
- Validate the transaction-local context and policies in a non-production database before enabling enforcement.
- Do not enable RLS or run migrations against production as part of this branch-only work.

## Immediate next implementation step

Fix the insights endpoint's implicit oldest-workspace selection by requiring an explicit `workspaceId`, validating the authenticated user's membership and `feedback:read` permission for that workspace, and returning a clear client error when the parameter is absent or invalid. Keep the change isolated and add tests for multi-workspace selection and unauthorized workspace IDs.
