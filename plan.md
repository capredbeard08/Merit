# MERIT product and implementation plan

## Product direction
MERIT is a privacy-focused customer-feedback operations platform for establishments and corporations.

**Customer feedback, quietly automated.**

Core loop: completed service → feedback request or public QR response → customer response → recurring issue/theme → operational follow-up.

The authenticated workspace is desktop-first for managers and operations teams. Public guest feedback, invitations, sign-in, and time-sensitive notifications must remain responsive on mobile. Longer-term direction includes downloadable desktop software and an iOS companion; the current deliverable remains a web MVP.

Visual direction: warm ivory, deep green, restrained typography, generous space, and calm motion.

## Product surfaces

### Public website and onboarding
- Explain the workflow and operational outcomes in plain language.
- Show concrete product proof rather than unsupported claims.
- Keep signup accessible and resilient to interrupted connections.
- Do not invent pricing, integrations, security certifications, or legal facts.

### Workspace operations
- Workspace- and branch-aware access with least privilege.
- Keep existing email/service-completion feedback distinct from anonymous QR feedback.
- Surface recurring themes and operational follow-up.
- Preserve drafts during connectivity interruptions and communicate sync/conflict states.
- Audit consequential changes and provide safe recovery.

### Anonymous guest QR feedback
- Permanent branch-specific QR destination with opaque public identifier.
- No guest account or customer identity requirement.
- Collect bounded rating/comment/answer data.
- Resolve branch/workspace only from server-side QR record.
- Use hashed idempotency keys and rate limiting.
- Present optional Google review destination neutrally to every guest, independent of rating. Never gate or selectively solicit reviews.

### Platform governance
- Platform roles distinct from workspace membership: Founder Super Admin, read-only Platform Admin, Engineer.
- Platform role alone does not grant access to business customer data.
- Business-controlled support authorization must be explicit, scoped, read-only, time-limited, revocable, and auditable.
- Privileged role changes require fresh authentication, MFA, and audit logging.
- Founder bootstrap is a controlled one-time process, not a hardcoded account.

## Current development
- feat/platform-access-foundation (draft PR #8): role isolation, platform console, audit controls, support authorization foundation, password reset, TOTP MFA, privileged-action rate limits, upload quarantine.
- feat/guest-feedback-foundation (draft PR #9): anonymous QR guest-feedback foundation, stacked on PR #8.
- PR #8 CI passed at its current reviewed head. PR #9 still needs its own complete CI and route/mobile/security verification. Combined behavior must be tested.
- Both PRs remain unmerged. CI success does not equal production readiness.
- Existing pilot remains https://merit-olive.vercel.app/.

## Security and release principles
1. Least privilege and fail-closed authorization.
2. Customer-data access is never implied by a platform operator role.
3. Tenant identity comes from verified server-side membership or a narrowly scoped public capability, never untrusted request payload.
4. Implement PostgreSQL RLS only after restricted runtime role and transaction-scoped tenant context exist.
5. Close cross-workspace foreign-key gaps, including guest QR and guest-feedback records.
6. Keep uploads quarantined until a privacy-appropriate scanner records a durable clean verdict.
7. Do not enable mandatory email verification until sender-domain verification and full delivery/browser journey are proven.
8. Verify MFA, backup-code recovery, password reset, and privileged-action flows in non-production.
9. Compare live schema/migration history and complete verified backup/restore drill before live migration.
10. No merge, production migration, Founder bootstrap, or deployment without explicit owner approval.

Preview deployment automation has been requested disabled during the current review period, but the project setting still needs independent verification. Do not assume a GitHub push has deployed.

## Implementation sequence
1. Finish platform-access and guest-feedback review, tests, and documentation.
2. Close tenant-integrity gaps for existing and guest-feedback models.
3. Implement restricted runtime DB role and transaction-scoped tenant data-access boundary.
4. Add RLS policies and cross-tenant tests only after steps 2–3 are verified.
5. Complete browser verification for MFA, recovery, email, guest QR, and platform governance in non-production.
6. Connect malware scanning and complete quarantine-to-clean lifecycle.
7. Complete independent security review, CORS/secrets review, backup/restore drill, and live schema comparison.
8. Obtain explicit approval for any merge or release.
9. Continue product work: 14-day guided pilot lifecycle, operational insights, integrations, offline-aware autosave/conflict handling, desktop/iOS packaging.

## Deferred decisions
- Do not buy or require a custom sending domain as a prerequisite for continued development. Keep email verification as a release gate until delivery can be tested.
- Do not introduce paid services as prerequisites without explicit cost/approval discussion.
- Do not claim antivirus, RLS, full tenant isolation, verified email, or production readiness until controls are implemented and tested.
- Pricing, legal entity/address, retention periods, and provider/subprocessor statements require confirmed owner decisions.
