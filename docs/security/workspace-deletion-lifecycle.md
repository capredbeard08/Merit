# MERIT Workspace Deletion Lifecycle

**Status:** approved product/security direction; implementation not yet started.  
**Applies to:** an individual business workspace, not the user's MERIT identity.

## Product decision

MERIT should provide a workspace deletion action in workspace management. It must be distinct from deleting a MERIT user account. A user may belong to multiple workspaces; deleting one workspace must not delete their account, sessions, or memberships in other workspaces.

## Who may initiate deletion

- Only a workspace member with the `OWNER` role may initiate deletion.
- An `ADMIN`, `MANAGER`, `AGENT`, or `VIEWER` cannot delete a workspace.
- Platform operators cannot delete a business workspace through their platform role.
- If ownership transfer is later supported, it must be completed before the existing owner can leave or delete the workspace.

## Required interaction

1. Display the exact workspace name and explain the consequences.
2. Require the owner to type the workspace name exactly.
3. Require a fresh authenticated session or step-up confirmation for this destructive action.
4. Submit a same-origin, CSRF-protected request.
5. Show the scheduled deletion date and provide a cancellation path during the retention period.
6. Send a confirmation/notification to the workspace owner and other workspace owners/admins where appropriate.

## Lifecycle and retention

- Use a soft-delete state first; do not immediately cascade-delete rows.
- Mark the workspace as deletion-pending and block new writes, integrations, invitations, scheduled follow-ups, and ordinary workspace access.
- Provide a 30-day recovery window as the proposed default. This duration must be confirmed against applicable legal, contractual, and retention obligations before release.
- Cancellation during the recovery window restores the workspace only after checking that integrations and credentials remain safe to reactivate.
- After the retention window, permanently purge workspace-scoped customer data and associated stored objects using an idempotent background job.
- Keep only records that must be retained for legal, security, billing, or fraud-prevention reasons, with access tightly restricted and retention periods documented. Do not silently retain customer content in audit metadata.
- Ensure object-storage blobs, webhook credentials, integration tokens, queued jobs, and external provider subscriptions are handled; a database cascade alone is not sufficient.
- Purge jobs must be retry-safe, observable, and scoped to one workspace ID. A failure must not cause a cross-workspace deletion.

## Audit and isolation

- Record who requested deletion, when, the workspace ID, scheduled purge time, cancellation, and final purge outcome.
- Keep the deletion audit trail outside the rows that will be cascaded away, or export a minimal tamper-evident tombstone before purge.
- Enforce workspace ownership and workspace ID predicates in every lifecycle operation.
- Re-check ownership and lifecycle status inside the same transaction that changes state.
- Concurrent deletion, cancellation, ownership change, and workspace writes must serialize safely.
- Return non-enumerating responses where appropriate; a user must not learn whether an unrelated workspace exists.
- A deleted or deletion-pending workspace must not be selectable through the workspace switcher or accessible through direct API routes.

## Account deletion is separate

Deleting a MERIT account is a separate workflow. It must first identify every workspace the user owns, require ownership transfer or workspace deletion decisions, and preserve other members' access to workspaces they do not own. It must also handle authentication credentials, sessions, external integrations, billing records, and legally required retention independently.

## Implementation gates

Do not implement destructive hard deletion until:
- the full workspace data graph and all external storage/integration side effects have been mapped;
- every workspace query and mutation rejects deletion-pending/deleted workspaces;
- soft-delete, cancellation, and purge behavior have database-backed tests;
- cross-workspace isolation and concurrent lifecycle races are tested;
- a verified recoverable production backup exists;
- legal/privacy retention requirements and customer-facing wording are reviewed.

**Current repository note:** the current Prisma `Workspace` model has cascading relations for business data and audit logs, but no workspace lifecycle state. A direct `workspace.delete()` would therefore be an immediate destructive cascade and would erase the workspace's own audit rows. Do not expose that behavior as the customer-facing delete action.
