import { createHmac, timingSafeEqual } from "node:crypto";

export const FEEDBACK_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

function signV2(feedbackId: string, issuedAt: number, expiresAt: number) {
  return createHmac("sha256", secret())
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
 * This gives existing customers a bounded 30-day transition instead of making
 * legacy bearer links valid forever.
 */
export function verifyFeedbackToken(
  feedbackId: string,
  token: string,
  legacySentAt?: Date | null,
  now = Math.floor(Date.now() / 1000),
) {
  const parts = token.split(".");
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

    return safeEqual(signV2(feedbackId, issuedAt, expiresAt), signature);
  }

  // Legacy tokens contained only HMAC(feedbackId), so their age must be
  // bounded by the persisted successful-send timestamp.
  if (!legacySentAt || Number.isNaN(legacySentAt.getTime())) return false;
  const sentAt = Math.floor(legacySentAt.getTime() / 1000);
  if (sentAt > now + CLOCK_SKEW_SECONDS || sentAt < now - FEEDBACK_TOKEN_TTL_SECONDS) return false;
  const legacySignature = createHmac("sha256", secret()).update(feedbackId).digest("base64url");
  return safeEqual(legacySignature, token);
}
