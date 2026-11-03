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
| Tenant isolation | Composite guest relations and explicit membership/workspace predicates exist; authenticated API isolation tests added in this review but not yet CI-validated. Prisma Postgres does not support custom roles, so restricted-role/RLS isolation is unavailable on the current provider. | Validate authenticated cross-workspace reads/writes; audit every business-data route for membership checks and workspace-scoped predicates; do not claim RLS protection |
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
1. PR #8 CI run #397 passed at code head `b41f706`; PR #9 CI run #413 passed at code head `a2b7e5c`. Re-run CI after material code changes.
2. PR #9's migration replay passed on disposable PostgreSQL in run #413; a combined PR #8 + #9 branch review is still required.
3. Guest-feedback integration tests for cross-tenant FK rejection, idempotency, rate-limit audit, QR lifecycle, malformed input, and stale reactivation passed in run #413.
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
| Prisma validation and generation | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed |
| Disposable migration replay | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed on disposable PostgreSQL |
| Cross-tenant FK rejection | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed |
| Public submission/idempotency | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed |
| QR lifecycle and concurrency | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed in integration test |
| Rate-limit/audit behavior | CI #413, `a2b7e5c` | 3 Nov 2026 | Passed |
| Android QR scan | Pending | Pending | Pending |
| iOS QR scan | Pending | Pending | Pending |
| Authenticated guest-feedback API isolation | New tests added after CI #413; awaiting new CI run | 3 Nov 2026 | Pending |\n| Full business-data route isolation audit | In progress | 3 Nov 2026 | Pending |\n| Dashboard/branch isolation | Pending | Pending | Pending |
| Owner sign-off | Pending | Pending | Pending |

## Explicit non-authorization

This acceptance plan does not authorize PR merge, production deployment, production migration, production Founder bootstrap, changes to live data, or purchase of a sending domain. Those remain separate decisions requiring explicit approval.
