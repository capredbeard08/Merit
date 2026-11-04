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
- Added a fail-closed release predicate: a quarantined artifact must remain quarantined for malicious, unknown, missing, timed-out, or failed scanner verdicts.

## Required execution invariants

1. Original artifacts are immutable. Analysis works on a separate copy; preserve the original hash and object reference.
2. Never execute suspicious code in production. Prefer static analysis and safe unpacking. Any required dynamic analysis belongs in an ephemeral isolated sandbox with no network, no secrets, read-only source, and strict CPU, memory, and time limits.
3. Approval is not a general-purpose permission. Bind it to one artifact hash, one exact operation, a short expiry, and one single-use nonce. Consume approval atomically with action creation/execution to prevent replay.
4. The Warden may report and recommend. It cannot silently rewrite source, delete artefacts, change configuration, alter database schema, grant privileges, or deploy.
5. A missing, unavailable, timed-out, or inconclusive scanner is not a clean verdict. Keep the artifact quarantined and request a decision.
6. Correlation is evidence of a relationship, not proof of malicious intent. Preserve rationale and confidence; never promote suspicion to fact without supporting evidence.
7. Do not put secrets, customer feedback, raw payloads, full source snippets, or personal data in JSON metadata. Keep evidence sanitized and source artifacts in private storage.
8. Preserve a recovery/tombstone record for disposal. Permanent deletion remains blocked until retention, legal hold, and recovery policy are implemented and approved.
9. Keep historical security records independent of workspace/user cascades. Use controlled retention, not incidental foreign-key deletion.

## Current boundaries and outstanding work

- Existing `recordSecurityEvent` classifies and stores security events; it is not a source-code scanner.
- No active CodeQL/Semgrep runner, dependency scanner, secret scanner, integrity monitor, behaviour monitor, or network monitor has been connected by this increment.
- No worker queue, bounded concurrency controller, isolated analysis sandbox, approval UI, approval-consumption transaction, or disposal/recovery workflow has been connected yet.
- The current policy module is a pure guard and its tests are not a substitute for server-side authorization or atomic database enforcement. Protected routes must independently verify the Founder role, fresh session, fresh MFA, approval scope, expiry, artifact hash, and one-time consumption.
- The Prisma Postgres provider currently used by MERIT does not support custom restricted PostgreSQL roles. Do not claim database RLS isolation or wire a pretend restricted role into runtime connections.
- No production database migration, production deployment, merge, or destructive operation is authorized by this work.

## Verification required before deployment

1. Validate Prisma schema and generate the Prisma client.
2. Replay the complete migration chain against disposable PostgreSQL, then run the security suite, integration tests, type-check, and production build.
3. Add database-backed tests for approval race/replay, artifact-hash mismatch, cross-workspace access, and incident retention after workspace deletion.
4. Implement and test the scanner adapters, queue limits, sandbox, approval UI, atomic approval consumption, audit trail, and recoverable disposal workflow.
5. Run an independent security review and verify the full route authorization matrix.
6. Only after all agreed work is complete, review the final branch and explicitly authorize deployment. Until then, keep Vercel previews disabled and production untouched.
