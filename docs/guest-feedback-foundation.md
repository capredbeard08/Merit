# MERIT Guest Feedback — Foundation

## Release 1: permanent establishment QR

Guest Feedback is a separate public-entry workflow from the existing authenticated/email feedback request flow. It belongs to an existing workspace and branch and must not create customer accounts or require customer sign-in.

## Data model
- GuestQrCode represents a permanent public QR destination for one branch.
- publicId is a high-entropy opaque locator used in the public URL. It is not an authentication credential and never grants access to workspace data.
- QR lifecycle states are ACTIVE, PAUSED, and REVOKED. Public resolution accepts only active codes attached to non-archived branches.
- GuestFeedback stores anonymous ratings and optional comments/question answers separately from existing email-based Feedback and FeedbackReply models.
- submissionKeyHash is a server-hashed idempotency key. Raw idempotency keys must not be stored.
- Branch.googleReviewUrl stores an optional branch-specific Google review destination.

## Public-route security invariants
1. Resolve the QR code by opaque public ID and require ACTIVE status.
2. Derive workspace and branch IDs exclusively from the resolved QR record. Never accept tenant IDs from the public request body.
3. Confirm the branch is not archived and belongs to the QR record's workspace.
4. Do not expose workspace IDs, internal branch IDs, QR database IDs, customer records, or dashboard data in public responses.
5. Validate and bound all user input on the server; comments are optional and capped at 2,000 characters.
6. Hash idempotency keys before persistence and enforce uniqueness to prevent duplicate writes on retries.
7. Apply rate limiting and record abuse/security events before enabling public submission in production.
8. Present the Google review destination neutrally to every guest after submission, independent of rating. Never gate or selectively solicit Google reviews.

## Tenant-integrity requirement
Composite tenant integrity has now been added to the draft Prisma schema and guest-feedback migration:
- GuestQrCode references Branch through workspaceId + branchId.
- GuestFeedback references Branch through workspaceId + branchId.
- GuestFeedback references GuestQrCode through workspaceId + branchId + qrCodeId.
- Matching unique parent indexes are included.
- The migration keeps workspace foreign keys and adds composite branch/QR constraints.

The migration has not been applied to any live database. CI schema validation, migration replay on disposable PostgreSQL, and negative cross-tenant insert tests must pass before this can be considered verified. The review-only candidate remains documentation, not executable migration material.

The public submission handler now locks and rechecks both the QR and branch rows inside the write transaction. A pause/revocation or branch archival that wins the row lock must prevent a later submission; a submission that obtains the lock first serializes before the lifecycle change. Rate-limit rejections attempt to write a sanitized SecurityEvent and workspace audit entry. Logging failure never changes a blocked request into an accepted submission.

## Deliberately deferred
- Session/transaction-based QR generation and expiry.
- Customer identity capture.
- Incentives or review gating.
- Email/SMS delivery dependencies.
- Automated AI analysis of guest feedback until privacy and data-processing controls are reviewed.

## Migration and release status
The additive migration 20261103020000_guest_feedback_foundation follows the current platform-access and TOTP migrations. It has not been applied to any live database.

PR #9 current code head `a2b7e5c` passed MERIT CI run #413: Prisma validation/client generation, disposable PostgreSQL migration replay, database-backed support authorization and guest-feedback integration tests, Security Warden tests, TypeScript, and production build. This validates the committed schema/migration and automated test suite at that code head; it does not replace QR scan/print tests, mobile/browser verification, restricted-runtime/RLS work, or pilot-owner approval. PR #9 remains a draft stacked on PR #8.

No merge, live migration, or deployment is authorized by this document. Apply only through the controlled migration process after review and explicit owner approval.
