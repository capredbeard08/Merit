# Groq feedback intelligence

## Scope

The first Groq-backed workflow summarizes recurring themes in written Guest Feedback comments. It is optional and on-demand for workspace members with the `ai:use` permission. It does not make business decisions, change feedback, contact customers, or persist the model's response.

## External-processing consent

- The user must confirm the external-processing notice for each analysis request.
- The API independently requires `confirmExternalProcessing: true`; a UI-only checkbox is not the security boundary.
- The request is limited to the selected workspace and is rate-limited to 10 requests per user per hour.
- MERIT writes a workspace audit record before sending comments to Groq. The record contains provider, operation, count and redaction mode only—not comment text or customer identifiers.
- The analysis result is shown as a suggestion and must be checked against original feedback.

## Data handling

- The server calls Groq using `GROQ_API_KEY`; the key is never sent to the browser.
- The request includes at most the latest 100 non-empty comments, each capped at 1,200 characters, plus its rating.
- Email addresses, phone-like strings and HTTP(S) URLs are pattern-redacted before the request.
- Pattern-based redaction is **not anonymisation** and cannot guarantee removal of names, addresses, order references or other identifying details. The UI tells users this and warns against sending sensitive comments.
- No customer IDs, user IDs, workspace IDs, branch IDs, QR IDs or raw database records are sent.
- Model output is schema-validated and bounded. Provider errors and response bodies are not exposed to the client or logged.
- Analysis is not persisted. A fresh, separately confirmed request is required to refresh it.

## Configuration

Required: `GROQ_API_KEY`. Optional: `GROQ_MODEL` (defaults to `openai/gpt-oss-120b`).

The key is present in Vercel environment metadata for Preview and Production. This change does not read its value, change environment settings, or trigger a deployment. A real provider call must be verified in an authorised staging environment after reviewing the applicable Groq data-processing and retention terms.

## Email delivery status and activation gate

The Resend transport and message templates are implemented and unit-tested, but successful delivery has not been proven. Email verification remains disabled by default. `requireEmailVerification` and `sendOnSignUp` are enabled only when `MERIT_EMAIL_VERIFICATION_ENABLED=true`.

Do not set that flag until all of the following are complete:

1. Verify the sending domain in Resend and publish the required DNS records.
2. Confirm the exact `EMAIL_FROM` identity is authorised by Resend.
3. Send a controlled test message and confirm delivery (including spam-folder checks).
4. Test sign-up, resend-verification, verification callback, sign-in and password reset end to end.
5. Only then enable `MERIT_EMAIL_VERIFICATION_ENABLED=true` in the approved environment and redeploy that environment.

The code does not set the flag in Vercel. No Vercel environment values are changed by this PR.
