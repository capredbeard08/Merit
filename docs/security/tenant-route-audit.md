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
| `PATCH /api/branches/[id]` | Membership check, workspace-scoped existence lookup, then workspace-scoped conditional update via global Prisma; audit write separately | Keep the workspace predicate on the mutation itself (e.g. updateMany with both ID and workspace ID, or an equivalent composite key). A prior scoped read followed by an unscoped update is weaker under concurrency and future policy changes. Make the mutation and audit behavior deliberately consistent. |
| `DELETE /api/branches/[id]` | Membership check, scoped existence lookup, then workspace-scoped conditional archive via global Prisma; audit write separately | Same mutation-predicate concern as PATCH. |
| `GET /api/feedback` | Auth session, explicit membership and role checks, query filtered by workspace ID via global Prisma | Application-level filter is present; RLS enforcement is not yet connected. |
| `GET /api/files` | Auth session, membership and role checks, query filtered by workspace ID via global Prisma | Application-level filter is present; RLS enforcement is not yet connected. |
| `POST /api/invitations` | Auth session, membership and role checks, invitation writes carry workspace ID; user lookup is global by email | Global user lookup is identity-level, not tenant data. Invitation writes still need tenant-scoped transaction enforcement. Audit write currently happens separately. |
| `GET/POST /api/members` | Membership helper, role check, workspace-filtered membership reads/writes; user lookup global by email | Workspace predicates are present. Membership management is security-sensitive and needs careful policy design; do not treat Member as an ordinary tenant table. |
| `GET /api/insights` | Requires explicit workspace ID, exact membership lookup and `feedback:read` role check | Workspace-selection defect corrected in this branch; tenant query still uses global Prisma pending RLS integration. |
| `GET /api/security/events` | Auth session, explicit membership and role checks, workspace-filtered event query and groupBy via global Prisma | Application-level filters are present; ensure both queries execute under the same tenant transaction after RLS is introduced. |
| `POST /api/follow-ups/process` | Cron-secret authentication; global worker scans queued jobs across workspaces and updates follow-ups and feedback | Cross-tenant worker by design. It needs a dedicated, tightly scoped worker role/capability and per-workspace transaction context. Do not expose this worker to ordinary tenant runtime credentials. |

## Remaining route inventory

These paths were present in the branch tree but were not fully source-reviewed in this pass. Each requires a deliberate classification before RLS rollout:

- `/api/branches/[id]/restore` — reviewed; restoration now uses a conditional update scoped by branch ID and workspace ID.

- `/api/feedback/[id]`
- `/api/feedback/[id]/click` — reviewed; click tracking now scopes the mutation to the feedback's workspace.

- `/api/feedback/[id]/optout` — reviewed; customer opt-out, feedback status and follow-up cancellation now include workspace scope.

- `/api/files/[id]`
- `/api/files/[id]/erase` — reviewed; final database deletion is conditional on file ID, workspace ID, erasure-pending status and the exact deletion timestamp.

- `/api/files/[id]/restore`
- `/api/files/upload`
- `/api/insights/generate`
- `/api/integrations/webhook` — reviewed; endpoint revocation uses a workspace-scoped conditional mutation.

- `/api/invitations/accept`
- `/api/public/feedback/[id]`
- `/api/replies` — reviewed; now requires explicit workspace ID and validates exact membership instead of silently selecting the oldest membership.

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

## Reviewed in the current implementation pass

- `PATCH/DELETE /api/branches/[id]`: mutations now include branch ID and workspace ID.
- `POST /api/branches/[id]/restore`: restoration is a conditional workspace-scoped mutation.
- `GET /api/feedback/[id]/click`: click tracking update includes workspace ID.
- `GET /api/feedback/[id]/optout`: customer, feedback and queued follow-up mutations include workspace ID.
- `POST /api/public/feedback/[id]`: atomic claim includes feedback ID and workspace ID.
- `POST /api/webhooks/service-completed`: endpoint last-used update includes endpoint ID, workspace ID and active status.
- `POST /api/invitations/accept`: invitation is conditionally claimed once and membership upserted in the same transaction.
- `DELETE /api/integrations/webhook`: revocation is conditional on endpoint ID, workspace ID and active status.
- `POST /api/files/[id]/erase`: final row deletion is conditional on tenant ID and the exact pending-erasure state.
- `GET /api/replies`: requires explicit workspace ID and validates exact membership/role rather than selecting the oldest membership.

These remain application-level protections using the global Prisma client. They are not a substitute for RLS. The signed public feedback token currently has no expiry; it is deterministic from the feedback ID and `AUTH_SECRET`. Before production use, decide on a bounded token lifetime and a safe rotation/compatibility plan for already-issued links. Also review whether GET-based click/opt-out actions should use CSRF-resistant POST flows where practical.

## Immediate next implementation step

Continue the source audit for file lifecycle routes, insights generation, integrations, workspace management and auth/system routes. Prioritize mutations that perform an unscoped update/delete after a scoped read, and preserve explicit workspace selection consistently across every tenant-facing API.
