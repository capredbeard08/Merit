# Platform access integration plan for PR #3

Status: integration branch created from `security/remediation-phase-1`. This document records the schema reconciliation required before application code is ported.

## Source of truth

- Consolidation base: PR #3, branch `security/remediation-phase-1`.
- Reviewed feature source: PR #8, branch `feat/platform-access-foundation`.
- PR #8 must not be merged wholesale. Its migration history is not compatible with PR #3's current migration chain.

## Confirmed schema differences

PR #3's current schema has no `PlatformAccess`, `SupportAccessRequest`, `RateLimitBucket`, `TwoFactor`, `twoFactorEnabled`, or `twoFactorEnabledAt` models/fields. PR #8 introduces these along with platform roles and support-access enums.

PR #3 already has a newer migration chain containing:
- `20261109010000_file_evidence_legal_hold`
- `20261110100000_workspace_relation_guards`
- `20261110101500_workspace_id_immutability`
- `20261110110000_followup_first_attempt`
- `20261110120000_feedback_internal_notes`

PR #8 instead contains older, separately named workspace/follow-up migrations and the platform-access/MFA migrations. Do not copy those old workspace/follow-up migrations into this branch.

## Required integration design

Create one new additive migration after PR #3's current latest migration. It must:
1. Add platform role, support scope and support status enums.
2. Add `PlatformAccess`, `SupportAccessRequest`, `RateLimitBucket`, and Better Auth `TwoFactor` tables.
3. Add the two-factor state fields to `User`, with a database-enforced enrollment timestamp trigger equivalent to PR #8's step-up migration.
4. Preserve platform access assignment history: the subject-user FK must be `ON DELETE RESTRICT`; grantor/decider/revoker references may use `SET NULL` where designed.
5. Enforce one active Founder Super Admin using the partial unique index.
6. Keep workspace-scoped support requests isolated and require explicit workspace-owner/admin approval.
7. Preserve PR #3's existing relation guards, immutable workspace IDs, follow-up retry semantics, legal-hold fields and internal feedback notes.

## Application code port order

1. Platform role/capability policy and tests.
2. Rate limiting and security-event allow-list helpers.
3. MFA/auth client and account-security UI, with fresh TOTP-authenticated session step-up.
4. One-time Founder bootstrap endpoint (disabled until verified email delivery, MFA, secret configuration and rehearsal are complete).
5. Operator grant/revoke API and protected platform console.
6. Support request/approval/revocation APIs and business-side approval UI. Do not add generic customer-data support endpoints; no support data read routes are currently implemented on PR #8.

## Non-negotiable safeguards

- No permanent file-erasure endpoint, purge timer, or automatic hard deletion.
- Deleted files remain recoverable and traceable.
- No merge, production migration, deployment, production setting change, account bootstrap, or production data change without explicit approval.
- No platform role alone grants access to workspace customer data, feedback, replies, files, or AI content.
- Every support read, if separately approved and implemented later, must be explicitly scoped to the exact workspace and approved resource scope, immediately before the workspace-constrained query, and audited.

## Validation gates

- Validate the combined Prisma schema and generate the client.
- Apply the new migration to a disposable PostgreSQL database already at PR #3's migration head.
- Run database-backed platform/support/MFA tests and the full Security Warden suite.
- Run tenant integrity tests, TypeScript and production build.
- Review the exact PR #3 diff and CI results before proposing merge readiness.

## Current state

This branch is intentionally a clean integration branch. The migration and application modules have not yet been ported. Founder bootstrap remains unavailable until the email-verification and MFA prerequisites are tested end to end.
