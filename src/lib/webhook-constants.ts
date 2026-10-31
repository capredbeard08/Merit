// Keep build-safe constants separate from the eagerly validated runtime environment.
// Webhook route modules are imported during Next.js page-data collection, when
// runtime secrets and public deployment URLs may not be available to the build.
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const WEBHOOK_MAX_AGE_SECONDS = 24 * 60 * 60;
export const WEBHOOK_MAX_FUTURE_SECONDS = 5 * 60;
