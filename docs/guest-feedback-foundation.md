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
The current migration creates single-column foreign keys. Those alone do not prove that the referenced branch and QR record belong to the same workspace or branch as the guest submission.

Before production:
- Add a composite GuestQrCode-to-Branch constraint on workspaceId + branchId.
- Add GuestFeedback-to-Branch integrity on workspaceId + branchId.
- Add GuestFeedback-to-GuestQrCode integrity on workspaceId + branchId + qrCodeId.
- Add matching Prisma composite relation definitions and validate the generated client.
- Run mismatch preflight queries against a disposable database copy before adding constraints.
- Include both guest tables in the RLS inventory and cross-workspace authorization tests.

The review-only candidate is docs/security/composite-tenant-keys-review.sql. It is not a migration and must not be executed as-is. Review deletion behavior and PostgreSQL version compatibility before promoting any constraint to a migration.

## Deliberately deferred
- Session/transaction-based QR generation and expiry.
- Customer identity capture.
- Incentives or review gating.
- Email/SMS delivery dependencies.
- Automated AI analysis of guest feedback until privacy and data-processing controls are reviewed.

## Migration and release status
The additive migration 20261103020000_guest_feedback_foundation follows the current platform-access and TOTP migrations. It has not been applied to any live database.

PR #9 is a draft stacked on PR #8. It requires its own complete CI, route-level security tests, QR scan/print tests, mobile verification, and combined-branch validation. Do not treat PR #8 CI or an earlier preview as proof that this foundation is ready.

No merge, live migration, or deployment is authorized by this document. Apply only through the controlled migration process after review and explicit owner approval.
