# MERIT Release Review — 31 October 2026

## Scope
Read-only source review of `capredbeard08/Merit`, branches, open pull requests, selected application routes, Prisma schema/migrations and reported CI/Vercel statuses. This is not a live penetration test, production database inspection, or authenticated end-to-end test.

## Current release position
- Do not merge any of PRs #1–#4 independently.
- Keep `main` unchanged until a single integrated candidate passes checks.
- PR #3 (security remediation) is based on `main` and has a successful MERIT CI run and Vercel status at the inspected head.
- PR #4 (dashboard sidebar restoration) is based on `security/remediation-phase-1`, not `main`. Its Vercel status is successful; no PR-triggered GitHub Actions run was returned for its head.
- PR #2 (dynamic Vercel auth origins plus dashboard/AI/webhook work) is based on `main` and has successful MERIT CI and Vercel status at the inspected head.
- PR #1 (static trusted-origin cleanup) has successful MERIT CI but failed Vercel status; its approach is superseded by the dynamic-origin work in PR #2, subject to integration review.

## Blocking integration findings

### 1. Authentication changes are mutually incompatible as currently proposed
- PR #2 replaces the static `trustedOrigins` list with Better Auth `baseURL.allowedHosts`, HTTPS and a canonical fallback.
- PR #3 adds CAPTCHA and an email-verification sender but retains the static trusted-origin list.
- PR #4 is based on PR #3 and adds a preview-only CAPTCHA bypass plus another static preview hostname.
- Merging PR #2 after PR #3 without carefully composing the auth configuration risks removing PR #3's CAPTCHA and email-verification sender configuration.
- Required outcome: one reviewed auth configuration combining the approved dynamic-host strategy with the required production CAPTCHA and email-verification behavior. Validate the exact Better Auth version/config semantics before release.

### 2. Email verification is not currently enforced in PR #3
In `src/lib/better-auth.ts` on `security/remediation-phase-1`:
- `requireEmailVerification: false`
- `sendOnSignUp: false`
- `sendOnSignIn: false`

The verification email callback exists, but these settings mean the PR does not currently require verification or send verification on signup. The PR summary should not claim verification is enforced. Before broad launch, verify the sender domain and enable the intended flow with end-to-end tests. If the pilot deliberately remains unverified, document that as a temporary accepted risk and add compensating controls.

### 3. AI feedback privacy needs a product decision and technical safeguards
PR #2 sends feedback text and ratings to Groq. The current redaction helper targets email addresses and phone-like strings only. It cannot reliably remove names, addresses, account numbers, or other sensitive content typed into free text.
Required before enabling AI for real customer data:
- disclose the AI processor and data categories in the applicable privacy/customer terms;
- define the business/customer notice and lawful basis/consent approach;
- minimize or redact more than email/phone patterns, while acknowledging regex limitations;
- make the selected workspace explicit in the API request and verify membership for that workspace instead of silently choosing the user's earliest membership;
- test prompt-injection handling and ensure outputs remain evidence-grounded.

### 4. Dashboard changes overlap
PR #2 substantially changes dashboard metrics, branch filtering, click trends and navigation. PR #4 adds a different sidebar/navigation implementation to a dashboard that already contains PR #3's security and recovery components. Select one dashboard implementation and port the needed functionality deliberately; do not merge both implementations blindly.

## Security remediation checks
- Review every workspace-scoped route for membership, role and cross-entity ownership checks.
- Inspect actual SQL migrations and the live PostgreSQL catalog before claiming Row Level Security is enabled. Prisma schema declarations alone do not prove RLS policies exist.
- Test recoverable file deletion/restoration and branch archival/restoration, including retention and blob/database consistency.
- Test atomic follow-up claims under concurrent workers, stale-claim recovery, opt-outs and provider idempotency.
- Verify production and preview environment variables, especially `AUTH_SECRET`, email provider credentials, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, `RECAPTCHA_SECRET_KEY`, CAPTCHA site key, `CRON_SECRET` and `GROQ_API_KEY`.
- Confirm production CSP, CORS, rate limits, webhook signature/replay controls, backup retention and a successful isolated restore drill.
- Confirm production debug settings and secret-file ignore/history checks.

## Release gates
1. One integrated branch with documented source PRs and no unresolved conflicts.
2. CI passes: tests, typecheck and production build.
3. Vercel preview build passes.
4. Signup, email verification, login, logout and password recovery tested on canonical and preview hosts.
5. Cross-workspace and role-based authorization tests pass.
6. Database migrations are tested on an isolated production-like database with backup/restore evidence.
7. Feedback request → email → customer submission → correct workspace dashboard flow passes.
8. AI processing is disclosed, minimized, workspace-scoped and tested.
9. File recovery, branch archival and follow-up concurrency tests pass.
10. Founder approves the release after reviewing evidence.

## Pull request links
- [PR #1 — stable auth origin](https://github.com/capredbeard08/Merit/pull/1)
- [PR #2 — dynamic Vercel auth origins and product changes](https://github.com/capredbeard08/Merit/pull/2)
- [PR #3 — security remediation](https://github.com/capredbeard08/Merit/pull/3)
- [PR #4 — dashboard sidebar restoration](https://github.com/capredbeard08/Merit/pull/4)

## Change safety
No production branch merge, deployment, migration, or environment-setting change is authorized by this review document. Integrate and validate on a dedicated candidate branch first.
