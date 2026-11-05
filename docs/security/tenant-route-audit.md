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
| `POST /api/follow-ups/process` | Cron-secret authentication; global worker scans queued jobs across workspaces; claims, fetches and state changes now carry workspace ID and expected status | Still a cross-tenant system worker using global Prisma. It needs a dedicated, tightly scoped worker role/capability and per-workspace transaction context. Do not expose this worker to ordinary tenant runtime credentials. |

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
- `GET /api/feedback/[id]/click`: validates and redirects only; no GET-based click mutation.
- `GET /api/feedback/[id]/optout`: customer, feedback and queued follow-up mutations include workspace ID.
- `POST /api/public/feedback/[id]`: atomic claim includes feedback ID and workspace ID.
- `POST /api/webhooks/service-completed`: endpoint last-used update includes endpoint ID, workspace ID and active status.
- `POST /api/invitations/accept`: invitation is conditionally claimed once and membership upserted in the same transaction.
- `DELETE /api/integrations/webhook`: revocation is conditional on endpoint ID, workspace ID and active status.
- `POST /api/files/[id]/erase`: final row deletion is conditional on tenant ID and the exact pending-erasure state.
- `GET /api/replies`: requires explicit workspace ID and validates exact membership/role rather than selecting the oldest membership.\n- `POST /api/follow-ups/process`: worker candidate selection, claims, fetches and follow-up/feedback status mutations now include workspace ID; state changes are conditional on expected status. The worker remains cross-tenant by design and is not RLS-isolated.

These remain application-level protections using the global Prisma client. They are not a substitute for RLS. The signed public feedback token currently has no expiry; it is deterministic from the feedback ID and `AUTH_SECRET`. Before production use, decide on a bounded token lifetime and a safe rotation/compatibility plan for already-issued links. GET-based click tracking is now read-only, and opt-out state changes require an explicit POST confirmation. The signed public feedback token still has no expiry; before production use, implement a bounded token lifetime and a safe rotation/compatibility plan for already-issued links.

## Immediate next implementation step

The first-pass route inventory is now reviewed for the listed API paths. Next, perform a schema-to-route pass for composite tenant foreign keys and relation traversals, add concurrency/replay and cross-workspace negative tests, and design the dedicated worker/RLS bootstrap model. Do not enable RLS until those prerequisites are implemented and tested in a non-production database.


## Schema-level integrity follow-up (2026-10-31)

The Prisma schema currently models several tenant relations with single-column foreign keys. Application workspace predicates do not prevent a malformed write from linking a child row to a parent in another workspace if a route misses validation.

A review-only SQL candidate was added at `docs/security/composite-tenant-keys-review.sql`. It:
- reports existing cross-workspace links before any DDL;
- proposes composite unique indexes and foreign keys for Customer→Branch, ServiceEvent→Branch/Customer, Feedback→Branch/Customer/ServiceEvent, FollowUp→Feedback, FeedbackReply→Feedback, and WebhookEndpoint→Branch;
- is intentionally not in `prisma/migrations/` and has not been executed.

This is not yet implemented schema enforcement: Prisma relation definitions must be updated to represent the composite keys, generated-client/type validation must pass, and the PostgreSQL server version must be checked for the optional-branch `ON DELETE SET NULL (branchId)` syntax. Do not promote the candidate to a migration until those steps and a read-only data-integrity review are complete.


## Public feedback link safety follow-up (2026-11-05)

- The email feedback CTA's GET endpoint now validates the signed token and redirects without changing feedback state. Automated link scanners may follow the URL, but cannot set `clickedAt` or change the feedback status.
- The opt-out page now presents a confirmation step. Only an explicit client POST to `/api/feedback/[id]/optout` performs the customer opt-out, feedback status update, and queued follow-up cancellation.
- These changes prevent GET prefetches from silently changing customer preferences or feedback state. They do not add token expiry: the deterministic HMAC token remains non-expiring and must be replaced with a bounded-lifetime, rotatable capability before production email rollout.


## Database relation-guard implementation (2026-11-05)

A PostgreSQL migration candidate is now included at `prisma/migrations/20261105090000_workspace_relation_guards/migration.sql`. It installs BEFORE INSERT/UPDATE guards for:
- Customer → optional Branch
- ServiceEvent → Branch and Customer
- Feedback → Branch, Customer and ServiceEvent
- FollowUp → Feedback
- FeedbackReply → Feedback
- WebhookEndpoint → optional Branch

The guards lock and inspect each referenced parent row and reject a relation when its workspace ID differs from the child row's workspace ID. This preserves the current optional-branch behavior without relying on a composite `ON DELETE SET NULL` action that could accidentally null the required child workspace ID.

The CI workflow now provisions a disposable PostgreSQL 16 service, applies the migration chain with `prisma migrate deploy`, and runs database integration tests for cross-workspace relation inserts, updates and bulk updates. These tests validate database integrity, not API authorization.

**Important limits:** these triggers do not provide row-level security and do not prevent an incorrectly scoped SELECT, UPDATE or DELETE that does not change a guarded relation. Application-level membership checks and workspace predicates remain mandatory. API-level negative tests for reads, ordinary updates/deletes, relation traversal and bulk operations are still outstanding. The migration has not been applied to production.


## Membership-revocation race hardening (2026-11-05)

`withWorkspacePermission` now acquires a PostgreSQL `FOR SHARE` lock on the authenticated actor's exact `Member` row inside the same transaction as the tenant mutation. A concurrent membership deletion or role update must wait for the authorized mutation to finish; if revocation or downgrade wins first, the helper denies the write.

The helper is now used for:
- branch creation, update, archive and restore;
- feedback status updates;
- file soft-delete, recovery, permanent-erasure claim, and upload-completion record creation;
- webhook endpoint creation and revocation;
- invitation and member creation;
- insight generation; and
- workspace renaming.

Other flows have separate boundaries: workspace creation inserts its initial owner membership in one nested database write; invitation acceptance conditionally claims a single-use token and creates membership in one transaction; public feedback and opt-out use signed capability tokens; inbound webhooks and follow-up processing use separate integration/cron credentials.

The integration suite also verifies that a concurrent membership deletion blocks while a protected mutation holds the membership lock. This is not a substitute for RLS and does not automatically protect read-only requests. It is also not a full HTTP route integration suite. API-level negative tests for cross-workspace reads, ordinary updates/deletes, relation traversal and bulk operations remain required before merge. Long-running external storage deletion is not performed inside the database transaction; the file is first moved to an authorized, recoverable erasure-pending state.


## Public feedback capability lifetime (2026-11-05)

New public feedback and opt-out links use versioned HMAC capabilities containing a signed issue time and expiry. The default validity period is 30 days. The signature is bound to the feedback ID and both timestamps; malformed, tampered, expired, or implausibly future-dated tokens are rejected.

Pre-v2 links are accepted only when the associated feedback record has a persisted successful-send timestamp within the same 30-day grace period. This gives already-sent pilot emails a bounded transition window; legacy links without a recorded send time are rejected. The click redirect, feedback page, feedback submission API, opt-out confirmation page and opt-out API all use the same verification policy.

Email scanners can follow the GET redirect without changing feedback or consent state. Opt-out remains a deliberate POST after a confirmation screen. This token lifetime is a capability expiry, not a replacement for customer consent, one-response state transitions, or application authorization.


## Upload cleanup and bearer-token referrer protection (2026-11-05)

If upload authorization is revoked after the private Blob upload has completed but before the FileAsset record is written, the completion callback now attempts to delete the orphaned Blob. If that cleanup fails, it records a high-severity `UPLOAD_ORPHAN_CLEANUP_FAILED` security event with the object pathname (not the customer file contents or token) for operator reconciliation. The upload remains rejected and is never made available in MERIT.

The public feedback and opt-out pages set a `no-referrer` policy so their bearer capability query strings are not forwarded as referrer data to other origins.


## Tenant ownership immutability (2026-11-05)

The relation guards validate child-to-parent workspace equality on insert/update. A further bypass was identified: changing a parent record's own `workspaceId` could make existing children cross-workspace without touching those child rows. A separate migration now makes `workspaceId` immutable for Member, Branch, Customer, ServiceEvent, Feedback, Invitation, WebhookEndpoint, AuditLog, FollowUp, FeedbackReply, Insight and FileAsset records.

The database integration suite now verifies that Branch, Customer, ServiceEvent and Feedback cannot be reassigned to another workspace. A legitimate future tenant transfer must be an explicit, audited migration that reconciles all dependent records; it must not use ordinary application updates.


## Explicit opt-out precedence for integrations (2026-11-05)

The service-completed webhook no longer clears `Customer.optedOutAt` when an incoming integration event says `feedbackContact: true`. A customer's explicit MERIT opt-out remains authoritative; ordinary service events cannot silently reverse it. The webhook also clears the stored `consentAt` when the incoming event carries no feedback-contact consent, and it does not create a feedback request or follow-up for an opted-out customer.

Re-consent is deliberately deferred to a separate explicit workflow. A regression test covers the case where a later webhook says feedback contact is allowed but the customer already has an opt-out timestamp.


## Opt-out propagation through the follow-up queue (2026-11-05)

An explicit customer opt-out now cancels all queued and currently processing follow-ups for that customer across the workspace, not only the single feedback request whose link was used. The worker rechecks both queue state and the customer's latest opt-out state immediately before provider dispatch.

After the provider call, the worker only marks the follow-up sent if it still owns the PROCESSING claim. It updates the feedback status only while that feedback remains PENDING, so a concurrent opt-out, reply or resolution is not overwritten by a late worker completion. An email request already accepted by an external provider cannot be recalled; the final check narrows that unavoidable external-system race, while the database state remains opt-out-safe.


## Feedback completion and queued-email suppression (2026-11-05)

Follow-up dispatch now requires the feedback record to remain in `PENDING` state, the customer to have a usable email address, and no customer opt-out timestamp. This is checked both after the worker claims the queue item and again immediately before provider dispatch. A customer submission or an administrative status change cancels the associated queued/processing follow-up; an explicit opt-out cancels all queued/processing follow-ups for that customer in the workspace.

The worker uses compare-and-set completion. If an opt-out or response cancels the PROCESSING claim while an external provider call is in flight, the worker cannot mark the follow-up SENT or overwrite the feedback's newer status. An email already accepted by the provider before cancellation is outside MERIT's ability to recall.


## In-flight webhook revocation and branch archival (2026-11-05)

The service-completed webhook now revalidates and takes `FOR SHARE` locks on both the matched, non-revoked webhook endpoint and the active branch inside the same database transaction that creates the service event, customer updates, feedback request and follow-up. If credential revocation or branch archival commits first, the webhook is rejected. If event processing acquires the locks first, revocation/archive waits until that already-authorized transaction commits.

This closes the earlier check-then-write window where a credential could be revoked or a branch archived after the initial lookup but before tenant records were created. The database integration suite verifies that concurrent endpoint revocation and branch archival wait on those locks.


Public opt-out confirmation now writes the customer preference change, feedback state, cancellation of that customer's queued/processing follow-ups, and a `CUSTOMER_OPTED_OUT` audit entry in one database transaction. The audit entry records only the workspace, customer record ID and source action; it does not copy the customer's email, phone or feedback text.


## HTTP route-level tenant boundary tests (2026-11-05)

A database-backed route integration suite now invokes the actual feedback, branch, file and webhook API handlers with a mocked authenticated session and a real disposable PostgreSQL database. It verifies:
- feedback listing returns only the selected workspace's records;
- a user without membership cannot list another workspace's feedback;
- a foreign feedback ID cannot be updated by supplying the caller's own workspace ID;
- a foreign branch cannot be archived through a different workspace ID;
- file reads and webhook revocation mask resources owned by a workspace the caller does not belong to; and
- rejected operations leave the foreign records unchanged.

These tests exercise the route handlers, not merely the underlying SQL triggers. They complement the database relationship tests; they do not constitute exhaustive coverage of every route or every relation traversal/bulk operation.
