# Groq feedback intelligence

## Scope

The first Groq-backed workflow summarizes themes in anonymous Guest Feedback comments. It is an optional, on-demand analysis for workspace members with `feedback:read`; it does not make decisions, change feedback, or contact customers.

## Data handling

- The server calls Groq using `GROQ_API_KEY`; the key is never sent to the browser.
- The request includes at most the latest 100 non-empty comments from the selected workspace.
- Email addresses, phone-like strings, and URLs are redacted before the request.
- No customer IDs, user IDs, workspace IDs, branch IDs, QR IDs, or raw database records are sent.
- The model response is schema-validated and bounded before it is returned.
- Provider errors are not exposed to the client or logged with response bodies.
- The endpoint is permission-checked and rate-limited to 10 requests per user per hour.
- Analysis is not persisted. A fresh request is required to refresh it.

## Configuration

Required: `GROQ_API_KEY`. Optional: `GROQ_MODEL` (defaults to `llama-3.3-70b-versatile`).

The key is already present in Vercel environment metadata for Preview and Production. This change does not read its value, change environment settings, or trigger a deployment. A real provider call must be verified in an authorized staging environment.

## Email delivery status and activation gate

The Resend transport and message templates are implemented and unit-tested, but successful delivery has not been proven. The current auth configuration intentionally keeps `sendOnSignUp` disabled and `requireEmailVerification` false. Vercel has entries for `RESEND_API_KEY` and `EMAIL_FROM`, but secret values are not inspected and sender-domain verification has not been established.

Do not require email verification until all of the following are complete:

1. Verify the sending domain in Resend and publish the required DNS records.
2. Confirm the exact `EMAIL_FROM` identity is authorized by Resend.
3. Send a controlled test message and confirm delivery (including spam-folder checks).
4. Test sign-up, resend-verification, verification callback, sign-in, and password reset end to end.
5. Only then enable sign-up verification and make it a required authentication step.

No Vercel environment values are changed by this PR.
