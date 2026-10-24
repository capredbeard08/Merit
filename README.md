# MERIT

The quiet AI operations assistant that listens to customer feedback and surfaces actionable CX insights.

## Deployment

Production is deployed through Vercel from the `main` branch.

## Groq AI insights

MERIT's `POST /api/insights/generate` endpoint uses Groq to turn recent workspace feedback into a summary, themes, and practical recommendations. The route checks the signed-in user's workspace permission and sends only feedback text and ratings; customer identifiers and timestamps are excluded, and common email addresses and phone numbers are redacted before sending.

Configure these server-side environment variables in Vercel (never use a `NEXT_PUBLIC_` prefix for the key):

- `GROQ_API_KEY` — required to enable AI insights; create a key at [Groq Console](https://console.groq.com/keys).
- `GROQ_MODEL` — optional; defaults to `openai/gpt-oss-20b`.

If `GROQ_API_KEY` is missing, the endpoint returns a configuration message rather than pretending an AI analysis was generated. After adding the key, redeploy the relevant Vercel environment and test insight generation using an account with the `ai:use` permission.
