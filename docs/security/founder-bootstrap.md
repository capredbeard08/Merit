# MERIT founder bootstrap

## Endpoint

`POST /api/platform/bootstrap` grants the initial `FOUNDER_SUPER_ADMIN` role to the currently authenticated user.

Requirements enforced by the route:

- An existing authenticated Better Auth session.
- The signed-in email must exactly match the normalized server-side `FOUNDER_BOOTSTRAP_EMAIL` allowlist. The designated account is `osagieuduebor6@gmail.com`; `crystallae9@gmail.com` remains a testing inbox and is not eligible for Founder bootstrap.
- The allowlist is not proof of email ownership and does not set `emailVerified`; the account must independently satisfy Better Auth email-verification requirements.
- The account's `emailVerified` flag must be true.
- A same-origin browser request.
- A deployment-only `FOUNDER_BOOTSTRAP_SECRET` with at least 32 UTF-8 bytes.
- A strict JSON body containing only `bootstrapSecret`.
- No previous Founder Super Admin assignment, including revoked assignments.
- No existing platform-access record for the requesting user.

The grant and its high-severity `SecurityEvent` are written in one serializable transaction. Concurrent bootstrap attempts fail closed; the database's unique active-founder index is an additional safeguard.

## Operational ceremony

1. Deploy the reviewed platform-access migration only after the backup/recovery gate and environment approvals are satisfied.
2. Configure `FOUNDER_BOOTSTRAP_EMAIL=osagieuduebor6@gmail.com` and a newly generated, high-entropy `FOUNDER_BOOTSTRAP_SECRET` as a server-only environment variable. Never use a `NEXT_PUBLIC_` name.
3. Create the intended founder account and complete email verification.
4. While signed in to that account, send the secret to this endpoint from the same origin.
5. Confirm the success response and the platform-access record/security event.
6. Immediately remove `FOUNDER_BOOTSTRAP_SECRET` from the deployment environment and redeploy the environment so the secret is no longer available to the running application.

Do not put the secret in source code, browser storage, URL parameters, logs, screenshots, or support messages. Do not expose this endpoint as a public self-service role selector.

## Limits

This endpoint only grants platform-console identity. It does not grant access to customer records, feedback, uploaded files, AI content, or any workspace. Business support access requires the separate Request Authorization workflow.

The route is not ready for production use until email verification is actually enabled and end-to-end tested, the schema migration is reviewed/applied in an approved environment, rate limiting is configured at the edge, and the full security/build checks pass.
