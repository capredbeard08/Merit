# MERIT Guest Feedback — Foundation

## Release 1: permanent establishment QR

Guest Feedback is a separate public-entry workflow from the existing authenticated/email feedback request flow. It is associated with an existing workspace and branch and must not create customer accounts or require customer sign-in.

### Data model

- `GuestQrCode` represents a permanent public QR destination for one branch.
- `publicId` is a high-entropy, opaque locator used in the public URL. It is not an authentication credential and never grants access to workspace data.
- QR lifecycle states are `ACTIVE`, `PAUSED`, and `REVOKED`. Public resolution must accept only active codes attached to non-archived branches.
- `GuestFeedback` stores anonymous ratings and optional comments/question answers separately from the existing email-based `Feedback` and `FeedbackReply` models.
- `submissionKeyHash` is reserved for a server-hashed idempotency key. Raw idempotency keys must not be stored.
- `Branch.googleReviewUrl` stores an optional branch-specific Google review destination.

### Security invariants for the public routes

1. Resolve the QR code by its opaque public ID and require `ACTIVE` status.
2. Derive workspace and branch IDs exclusively from the resolved QR record. Never accept tenant IDs from the public request body.
3. Confirm the branch is not archived and belongs to the QR record's workspace.
4. Do not expose workspace IDs, internal branch IDs, QR database IDs, customer records, or dashboard data in public responses.
5. Validate and bound all user input on the server; comments are optional and capped at 2,000 characters.
6. Hash idempotency keys before persistence and enforce uniqueness to prevent duplicate writes on retries.
7. Apply rate limiting and record abuse/security events before enabling public submission in production.
8. The Google review destination must be presented neutrally to every guest after submission, independent of their rating. Never gate or selectively solicit Google reviews.

### Deliberately deferred

- Session/transaction-based QR generation and expiry.
- Customer identity capture.
- Incentives or review gating.
- Email/SMS delivery dependencies.
- Automated AI analysis of guest feedback until privacy and data-processing controls are reviewed.

### Migration

The additive migration `20261103020000_guest_feedback_foundation` follows the current platform-access and TOTP migrations. It is not applied to any live database by this change. Apply only through the existing controlled migration process after CI and release review.
