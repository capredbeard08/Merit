# Red Squid Security Warden

**Status:** First implementation increment on `feat/red-squid-security-warden`. This is a schema and policy foundation, not an operational malware scanner and not a production-readiness certification.

## Purpose

Red Squid coordinates bounded specialist security workers that detect suspicious signals, preserve evidence, correlate findings, and present a clear incident report. The deep-sea pack is the design metaphor; it does not mean spawning thousands of autonomous agents. Worker concurrency, execution time, memory, and queue depth must be explicitly bounded.

## First implementation increment

- Added durable incident lifecycle records with severity, confidence, source, fingerprint, and timestamps.
- Added specialist finding records for Code, Behaviour, Dependency, Access, Data, Network, and Integrity hunters.
- Added immutable-original artifact references, SHA-256 identity, quarantine state, and chain-of-custody metadata.
- Added approval records bound to a precise action, artifact hash, expiry, and single-use nonce hash.
- Added action execution records, hunter run records, and explicit finding correlations.
- Kept `SecurityEvent` as the existing operational event stream; incident records complement it rather than replace it.
- Kept `workspaceId` on incidents as an unbound nullable historical identifier. Workspace deletion must not cascade-delete incident history.
- Added pure policy checks: only static analysis and quarantine are eligible for automatic execution; safe unpacking, deobfuscation, restore, and disposal require Founder Super Admin authority with a fresh session and fresh MFA, plus an exact unexpired approval bound to the artifact hash and action.
- Added persisted scanner verdict fields; unknown, malicious, error, and timeout verdicts are not clean.
- Added a transactional approval service: requests are short-lived, Founder decisions recheck platform role, revocation, MFA enrollment, and the persisted fresh session, and worker consumption is nonce-bound, artifact-hash-bound, scope-bound, and single-use.
- Added a database-backed hunter queue with a global cap of three active leases, 90-second renewable leases, hashed lease tokens, a three-attempt maximum, stale-worker fencing, and transactional queue audit events. The queue schedules work but does not execute scanners itself.
- Revalidates artifact hash and lifecycle state at request, approval, and consumption time. Restoration is blocked unless the persisted scanner verdict is CLEAN.

## Required execution invariants

1. Original artifacts are immutable. Analysis works on a separate copy; preserve the original hash and object reference.
2. Never execute suspicious code in production. Prefer static analysis and safe unpacking. Any required dynamic analysis belongs in an ephemeral isolated sandbox with no network, no secrets, read-only source, and strict CPU, memory, and time limits.
3. Approval is not a general-purpose permission. Bind it to one artifact hash, one exact operation, one canonical action-scope hash, the artifact hash, a short expiry, and one single-use nonce. Consume approval atomically with action creation/execution to prevent replay.
4. The Warden may report and recommend. It cannot silently rewrite source, delete artefacts, change configuration, alter database schema, grant privileges, or deploy.
5. A missing, unavailable, timed-out, or inconclusive scanner is not a clean verdict. Keep the artifact quarantined and request a decision.
6. Correlation is evidence of a relationship, not proof of malicious intent. Preserve rationale and confidence; never promote suspicion to fact without supporting evidence.
7. Do not put secrets, customer feedback, raw payloads, full source snippets, or personal data in JSON metadata. Keep evidence sanitized and source artifacts in private storage.
8. Preserve a recovery/tombstone record for disposal. Permanent deletion remains blocked until retention, legal hold, and recovery policy are implemented and approved.
9. Keep historical security records independent of workspace/user cascades. Use controlled retention, not incidental foreign-key deletion.

## Current boundaries and outstanding work

- Existing `recordSecurityEvent` classifies and stores security events; it is not a source-code scanner.
- Added a CI Code Hunter workflow using CodeQL `security-extended` for JavaScript/TypeScript, plus a Dependency Hunter workflow running `npm audit --omit=dev --audit-level=high`. These scan repository code and production dependencies in GitHub Actions; they do not scan uploaded customer artefacts or execute inside MERIT production.
- The first dependency scan reported 10 advisories (1 critical, 9 high). Non-breaking package updates now pin Next.js 15.5.29 and Zod 4.6.7, and override Next's PostCSS to 8.5.32 and Sharp to 0.35.4 or later. A subsequent audit reduced the report to three high findings in Prisma CLI's `deepmerge-ts` dependency; Prisma 7.10.1 is the suggested fix but would be a major-version upgrade, so no forced Prisma migration has been applied. A clean lockfile regeneration is in progress to ensure dev-only dependencies are classified correctly.
- No secret scanner, integrity monitor, behaviour monitor, or network monitor has been connected by this increment.
- The bounded queue is implemented, but no scanner worker is attached to it. No artifact scanner adapter, isolated analysis sandbox, or disposal/recovery executor is connected yet. Approval consumption records an authorized action but does not execute it.
- `security-warden-approvals.ts` provides the transactional server-side approval lifecycle, and the Founder-facing incident feed and decision route are connected. Route handlers call the service using the authenticated Better Auth session ID; never accept client-supplied Founder, MFA, or freshness flags.
- The Prisma Postgres provider currently used by MERIT does not support custom restricted PostgreSQL roles. Do not claim database RLS isolation or wire a pretend restricted role into runtime connections.
- No production database migration, production deployment, merge, or destructive operation is authorized by this work.

## Verification required before deployment

1. Validate Prisma schema and generate the Prisma client.
2. Replay the complete migration chain against disposable PostgreSQL, then run the security suite, integration tests, type-check, and production build.
3. Add database-backed tests for cross-workspace incident access and incident retention after workspace deletion. Approval race/replay, fresh-session gating, and artifact-hash mismatch now have integration coverage.
4. Attach reviewed scanner adapters to the bounded queue, extend hunter coverage with secret scanning and repository integrity checks, and implement an isolated sandbox before any dynamic analysis. Approval UI and transactional approval consumption exist, but execution and recoverable disposal remain disabled.
5. Run an independent security review and verify the full route authorization matrix.
6. Only after all agreed work is complete, review the final branch and explicitly authorize deployment. Until then, keep Vercel previews disabled and production untouched.
