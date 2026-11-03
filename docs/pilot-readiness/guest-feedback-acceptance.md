# MERIT Guest Feedback — Pilot Acceptance

**Review date:** 3 November 2026  
**Scope:** Permanent branch QR feedback (Release 1)  
**Status:** Draft acceptance plan — not approved for live pilot use

This document defines the evidence required before a business is invited to use Guest Feedback. A code change, successful build, or old preview URL is not acceptance evidence.

## Current evidence

| Control | Current state | Required evidence |
|---|---|---|
| Workspace/branch/QR composite integrity | Implemented and validated in draft schema/migration (CI #413, code head `a2b7e5c`) | Additional production-database audit before any live migration |
| QR submission lifecycle | Row locks/rechecks and optimistic QR-status updates implemented; CI integration tests passed at `a2b7e5c` | Browser/device validation and review of concurrent business-management flows |
| Duplicate submissions | HMAC-keyed idempotency exists; CI integration test passed | Browser retry/offline behaviour on a real device |
| Rate limiting | PostgreSQL-backed and fail-closed; CI test proves 429 and sanitized SecurityEvent | Production monitoring and database-outage verification |
| Public input validation | Zod schema bounds rating and message | Malformed JSON, wrong types, oversize message, and malicious-input tests |
| Tenant isolation | Composite guest relations added; RLS/runtime boundary not complete | Cross-tenant reads/writes rejected using restricted runtime role |
| QR presentation | QR preview and print/table-tent surfaces exist | Real-device scan, print dimensions, camera and browser tests |
| Mobile guest flow | Mobile-first page exists | Test on at least one Android and one iOS browser where available |
| Browser security headers | CSP allows the QR image provider host | Browser confirms QR image loads and no unnecessary CSP exceptions |
| Deployment safety | Production and preview must remain isolated | Confirm no preview or production deployment is initiated during this review |

## Required acceptance scenarios

### A. Data integrity
- Create two workspaces and at least one branch in each.
- Reject a QR code whose workspace and branch do not match.
- Reject guest feedback whose workspace, branch, and QR code do not all match.
- Reject cross-workspace inserts and updates at the database layer, not only in route validation.
- Verify workspace deletion and branch deletion follow the reviewed cascade/retention policy.

### B. Public guest journey
- Open a valid QR URL without signing in.
- Submit each valid rating and an optional comment.
- Confirm the public response does not disclose workspace IDs, branch IDs, QR database IDs, or customer records.
- Retry the same submission key and confirm exactly one record exists.
- Submit malformed JSON, invalid ratings, oversized comments, and hostile strings; verify bounded 4xx responses and no stack traces.
- Verify neutral Google review invitation behavior is identical for every rating.

### C. QR lifecycle and race behavior
- Unknown, paused, revoked, and archived-branch QR URLs must reject submissions.
- Run a submission concurrently with a pause/revocation and confirm the row lock produces a deterministic serialization: whichever operation obtains the lock first completes first.
- Once a pause/revocation has committed, a newly started submission must be rejected.
- A revoked QR code must never be reactivated through the product UI or API.

### D. Abuse and audit
- Exceed the per-IP and per-QR thresholds; confirm 429 and Retry-After.
- Confirm a sanitized RATE_LIMIT_TRIGGERED SecurityEvent and workspace audit entry are recorded when the event store is available.
- Simulate rate-limit storage failure; public submission must fail closed.
- Confirm event metadata contains no raw IP in JSON metadata, submission content, email, token, or raw submission key.

### E. Manager and branch experience
- Confirm only an authorized workspace member can create, pause, or revoke QR codes.
- Confirm a manager sees only the selected workspace/branch's guest feedback.
- Verify dashboard summaries, latest submissions, branch filters, QR preview, download, and print output.
- Verify QR images load under the production Content Security Policy.

## Release blockers

The following are not complete and block production pilot sign-off:
1. Current PR #8 and PR #9 CI must complete successfully on the exact reviewed heads.
2. Disposable PostgreSQL must apply the full combined migration chain successfully.
3. Guest-feedback integration tests must pass, including cross-tenant rejection and rate-limit audit.
4. Restricted non-owner runtime DB credentials and transaction-scoped tenant context must be implemented and tested before RLS or production tenant data access.
5. PostgreSQL RLS policies and cross-workspace tests must pass using the restricted runtime role.
6. Browser/mobile QR scan and print tests must be performed on a non-production environment.
7. Preview and Production database credentials must be confirmed isolated; no live database mutation is permitted during acceptance.
8. Verified production backup and restore drill must precede any future production migration.
9. Explicit pilot-owner approval is required before a real business is onboarded.

## Evidence log

Record each run with commit SHA, CI run URL, test environment, date, tester, result, and linked defect. Never mark an item passed without reproducible evidence.

| Check | Commit SHA / run | Tester / date | Result / defect |
|---|---|---|---|
| Prisma validation and generation | Pending | Pending | Pending |
| Disposable migration replay | Pending | Pending | Pending |
| Cross-tenant FK rejection | Pending | Pending | Pending |
| Public submission/idempotency | Pending | Pending | Pending |
| QR lifecycle and concurrency | Pending | Pending | Pending |
| Rate-limit/audit behavior | Pending | Pending | Pending |
| Android QR scan | Pending | Pending | Pending |
| iOS QR scan | Pending | Pending | Pending |
| Dashboard/branch isolation | Pending | Pending | Pending |
| Owner sign-off | Pending | Pending | Pending |

## Explicit non-authorization

This acceptance plan does not authorize PR merge, production deployment, production migration, production Founder bootstrap, changes to live data, or purchase of a sending domain. Those remain separate decisions requiring explicit approval.
