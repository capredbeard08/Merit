import { createHmac } from "node:crypto";

export function isGuestPublicId(value: string) {
  return /^[A-Za-z0-9_-]{24,128}$/.test(value);
}

export function safeGoogleReviewUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === "google.com" || host.endsWith(".google.com") ||
      host === "g.page" || host === "maps.app.goo.gl";
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function hashGuestSubmissionKey(qrCodeId: string, submissionKey: string, secret = process.env.AUTH_SECRET) {
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured correctly");
  return createHmac("sha256", secret)
    .update("merit-guest-feedback:v1:" + qrCodeId + ":" + submissionKey)
    .digest("hex");
}

export function feedbackRatingValue(rating: number) {
  return (["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const)[rating - 1];
}

export function feedbackRatingScore(rating: string) {
  const values: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return values[rating] ?? 0;
}
