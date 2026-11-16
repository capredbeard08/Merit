# Red Squid Security Warden

**Status:** Security foundation and private ClamAV worker implementation are present on `feat/red-squid-security-warden`. CI, dependency audit, CodeQL, and isolated scanner-container tests have passed on the current branch head. This is not a production-readiness certification: the worker has not been hosted or run against live uploads.

## Purpose

Red Squid coordinates bounded specialist security workers that detect suspicious signals, preserve evidence, correlate findings, and present a clear incident report. The deep-sea pack is the design metaphor; it does not mean spawning thousands of autonomous agents. Worker concurrency, execution time, memory, and queue depth must be explicitly bounded.

## Implemented foundation

- Durable incident lifecycle records with severity, confidence, source, fingerprint, and timestamps.
- Specialist finding records for Code, Behaviour, Dependency, Access, Data, Network, and Integrity hunters.
- Immutable-original artifact references, SHA-256 identity, quarantine state, and chain-of-custody metadata.
- Approval records bound to a precise action, artifact hash, expiry, and single-use nonce hash.
- Action execution records, hunter run records, and explicit finding correlations.
- Existing `SecurityEvent` operational event stream retained; incident records complement it rather than replace it.
- `workspaceId` on incidents is an unbound nullable historical identifier. Workspace deletion must not cascade-delete incident history.
- Pure policy checks: only static analysis and quarantine are eligible for automatic execution. Safe unpacking, deobfuscation, restore, and disposal require Founder Super Admin authority with a fresh session and fresh MFA, plus an exact unexpired approval bound to the artifact hash and action.
- Persisted scanner verdict fields; unknown, malicious, error, and timeout verdicts are not clean.
- Transactional approval service: requests are short-lived, Founder decisions recheck platform role, revocation, MFA enrollment, and the persisted fresh session, and worker consumption is nonce-bound, artifact-hash-bound, scope-bound, and single-use.
- Database-backed hunter queue with a global cap of three active leases, 90-second renewable leases, hashed lease tokens, a three-attempt maximum, stale-worker fencing, and transactional queue audit events.
- A private ClamAV DATA-hunter worker attached to the queue. It retrieves private Blob objects, checks size and SHA-256, streams a temporary copy to ClamAV over a local Unix socket, and records a verdict without modifying or releasing the original.
- ClamAV runtime smoke coverage for a benign file, EICAR test signature, oversized file, and encrypted ZIP archive.
- Code Hunter workflow using CodeQL `security-extended` for JavaScript/TypeScript. Latest SARIF review artifact on the current head contains zero findings.
- Dependency Hunter workflow running full-tree `npm audit`, including development dependencies. Latest retained audit reports zero vulnerabilities across 208 dependency entries.

## Required execution invariants

1. Original artifacts are immutable. Analysis works on a separate temporary copy; preserve the original hash and object reference.
2. Never execute suspicious code in production. The current worker does not execute uploaded content or implement custom archive extraction/deobfuscation. ClamAV performs bounded signature scanning. Any future dynamic analysis belongs in an ephemeral isolated sandbox with no network, no secrets, read-only source, and strict CPU, memory, and time limits.
3. Approval is not a general-purpose permission. Bind it to one artifact hash, one exact operation, one canonical action-scope hash, a short expiry, and one single-use nonce. Consume approval atomically with creation of the authorized action record. A separate controlled executor would be required before any file operation can occur.
4. The Warden may report and recommend. It cannot silently rewrite source, delete artefacts, change configuration, alter database schema, grant privileges, or deploy.
5. A missing, unavailable, timed-out, or inconclusive scanner is not a clean verdict. Keep the artifact quarantined and request a decision.
6. Correlation is evidence of a relationship, not proof of malicious intent. Preserve rationale and confidence; never promote suspicion to fact without supporting evidence.
7. Do not put secrets, customer feedback, raw payloads, full source snippets, or personal data in JSON metadata. Keep evidence sanitized and source artifacts in private storage.
8. Preserve a recovery/tombstone record for disposal. Permanent deletion remains blocked until retention, legal hold, and recovery policy are implemented and approved.
9. Keep historical security records independent of workspace/user cascades. Use controlled retention, not incidental foreign-key deletion.
10. ClamAV must remain private behind its Unix socket; do not expose its unauthenticated TCP interface.

## Current boundaries and limitations

- The Code Hunter scans repository code in GitHub Actions. The Dependency Hunter audits the npm dependency graph. Neither scans customer uploads or production runtime.
- The latest CodeQL SARIF artifact has zero results and a successful execution; the latest full-tree npm audit reports zero vulnerabilities. These are point-in-time CI results, not a guarantee against unknown vulnerabilities.
- No secret scanner, behaviour monitor, network monitor, or continuous repository integrity monitor has been connected by this increment.
- The ClamAV worker is implemented and attached to the bounded queue, but it has not been hosted or run against live uploads. There is no live Blob/production end-to-end test.
- Encrypted archives and files that exceed scanner limits are inconclusive; they must remain quarantined. A CLEAN ClamAV verdict is evidence only and never releases an upload automatically.
- No dynamic-analysis sandbox is active because no dynamic execution or custom unpacking is implemented. A sandbox is a prerequisite for any future dynamic-analysis capability.
- No disposal/recovery executor is connected. Approval consumption creates an authorized action record only; it does not execute file operations.
- Prisma Postgres used by MERIT does not support custom restricted PostgreSQL roles. Do not claim database RLS isolation or wire a pretend restricted role into runtime connections.
- No production database migration, production deployment, merge, or destructive operation is authorized by this work.

## Verification completed on current branch head

1. Prisma schema validation and Prisma Client generation.
2. Complete migration replay against disposable PostgreSQL.
3. Database-backed integration tests, including approval lifecycle and hunter-queue tests.
4. Security Warden tests, application and worker TypeScript checks, scan-verdict tests, and production build.
5. Private scanner image build and isolated ClamAV runtime tests: benign file, EICAR signature, oversized-file limit alert, and encrypted ZIP alert.
6. CodeQL `security-extended` scan with zero SARIF findings.
7. Full-tree npm audit with zero vulnerabilities (208 dependency entries).

## Before production activation

1. Host the worker in a separately isolated private runtime with managed secrets, constrained egress, resource limits, monitoring, and an explicit operational owner.
2. Run staging end-to-end tests using private Blob objects, queue claims, lease loss, timeouts, stale signatures, and quarantined uploads.
3. Complete a separate review of the full route authorization matrix, cross-workspace incident access, and retention after workspace deletion.
4. Implement and independently review a recoverable disposal workflow before any permanent deletion is enabled.
5. If dynamic analysis is ever added, design and test the isolated sandbox before enabling it.
6. Only after all agreed work is complete, review the final branch and explicitly authorize deployment. Until then, keep Vercel previews disabled and production untouched.
