import { createHmac, timingSafeEqual } from "node:crypto";

export const FEEDBACK_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function currentSecret() {
  const dedicated = process.env.FEEDBACK_TOKEN_SECRET?.trim();
  const value = dedicated || process.env.AUTH_SECRET;
  if (!value) throw new Error("FEEDBACK_TOKEN_SECRET or AUTH_SECRET is not configured");
  return value;
}

/**
 * During rotation, keep previous signing keys available for verification only.
 * AUTH_SECRET is also retained as a verification key when a dedicated
 * FEEDBACK_TOKEN_SECRET is introduced, preserving links issued before cutover.
 */
function verificationSecrets() {
  const current = currentSecret();
  const dedicated = process.env.FEEDBACK_TOKEN_SECRET?.trim();
  const previous = (process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const legacyAuthSecret = dedicated ? [process.env.AUTH_SECRET || ""] : [];
  return [...new Set([current, ...previous, ...legacyAuthSecret].filter(Boolean))];
}

function signV2(feedbackId: string, issuedAt: number, expiresAt: number, signingSecret = currentSecret()) {
  return createHmac("sha256", signingSecret)
    .update("merit-feedback-v2:" + feedbackId + ":" + issuedAt + ":" + expiresAt)
    .digest("base64url");
}

function safeEqual(expectedValue: string, providedValue: string) {
  const expected = Buffer.from(expectedValue, "utf8");
  const provided = Buffer.from(providedValue, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** Issue a versioned, time-bounded capability for one feedback request. */
export function createFeedbackToken(feedbackId: string, issuedAt = Math.floor(Date.now() / 1000)) {
  const expiresAt = issuedAt + FEEDBACK_TOKEN_TTL_SECONDS;
  return ["v2", issuedAt, expiresAt, signV2(feedbackId, issuedAt, expiresAt)].join(".");
}

/**
 * Verify a current expiring token. For links issued before v2, permit the old
 * static signature only when the related feedback was actually sent recently.
 * Previous keys are verification-only and should be removed after all tokens
 * signed with them have expired or passed their bounded legacy grace period.
 */
export function verifyFeedbackToken(
  feedbackId: string,
  token: string,
  legacySentAt?: Date | null,
  now = Math.floor(Date.now() / 1000),
) {
  const parts = token.split(".");
  const keys = verificationSecrets();
  if (parts.length === 4 && parts[0] === "v2") {
    const issuedAt = Number(parts[1]);
    const expiresAt = Number(parts[2]);
    const signature = parts[3];
    if (
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      issuedAt > now + CLOCK_SKEW_SECONDS ||
      expiresAt <= now ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > FEEDBACK_TOKEN_TTL_SECONDS
    ) return false;

    return keys.reduce((matched, key) => safeEqual(signV2(feedbackId, issuedAt, expiresAt, key), signature) || matched, false);
  }

  // Legacy tokens contained only HMAC(feedbackId), so their age must be
  // bounded by the persisted successful-send timestamp.
  if (!legacySentAt || Number.isNaN(legacySentAt.getTime())) return false;
  const sentAt = Math.floor(legacySentAt.getTime() / 1000);
  if (sentAt > now + CLOCK_SKEW_SECONDS || sentAt < now - FEEDBACK_TOKEN_TTL_SECONDS) return false;
  return keys.reduce((matched, key) => {
    const legacySignature = createHmac("sha256", key).update(feedbackId).digest("base64url");
    return safeEqual(legacySignature, token) || matched;
  }, false);
}
