// Pure constants only: this module is safe to import during Next.js build-time route collection.
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const WEBHOOK_MAX_AGE_SECONDS = 24 * 60 * 60;
export const WEBHOOK_MAX_FUTURE_SECONDS = 5 * 60;
