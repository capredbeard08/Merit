import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

export function createFeedbackToken(feedbackId: string) {
  return createHmac("sha256", secret()).update(feedbackId).digest("base64url");
}

export function verifyFeedbackToken(feedbackId: string, token: string) {
  const expected = Buffer.from(createFeedbackToken(feedbackId), "utf8");
  const provided = Buffer.from(token, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
