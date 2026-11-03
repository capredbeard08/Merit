# MERIT

**Customer feedback, quietly automated.**

MERIT is a privacy-focused customer-feedback operations platform for establishments and corporations. It helps teams collect feedback, identify recurring issues, and turn customer signals into operational follow-up.

## Product workflow
Completed service → feedback request or public QR response → customer feedback → recurring themes → operational follow-up.

The authenticated workspace is desktop-first for managers and operations teams. Public feedback pages and time-sensitive notifications must remain usable on mobile.

## Current development
- Platform-access foundation: draft PR #8 on feat/platform-access-foundation.
- Guest-feedback foundation: draft PR #9 on feat/guest-feedback-foundation, stacked on PR #8.
- Both pull requests remain unmerged. CI success is not production approval.

## Release and deployment safety
- Existing pilot: https://merit-olive.vercel.app/
- Do not merge these pull requests, run production migrations, bootstrap a production Founder account, or deploy new development without explicit owner approval.
- Email verification remains a release gate until sender-domain verification and the complete delivery/browser journey can be tested.
- Preview deployment automation has been requested disabled during this review period, but the project setting still needs independent verification. Do not assume a GitHub push has been deployed.
- Production migrations require a verified backup and restore drill and the controlled protected workflow.

## Security posture
Platform-role separation, fail-closed authorization, privileged-action rate limiting, MFA foundations, and upload quarantine have implementation work and earlier CI evidence. Current branch changes still require fresh CI. Guest-feedback tenant constraints, QR lifecycle locking, and rate-limit audit events are now in the draft branch but remain unverified until the current CI and integration tests pass.

Outstanding release gates include email verification and recovery testing, MFA browser/recovery testing, malware scanning, PostgreSQL RLS and tenant-integrity enforcement, CORS review, live schema/migration comparison, and a verified backup/restore drill. Files remain quarantined until a real scanner records a durable clean verdict.

Customer data is not a platform operator's default entitlement. Support access must be explicitly authorized by the business, narrowly scoped, time-limited, auditable, and revocable.
