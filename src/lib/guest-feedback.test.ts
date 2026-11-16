import test from "node:test";
import assert from "node:assert/strict";
import {
  feedbackRatingScore,
  feedbackRatingValue,
  hashGuestSubmissionKey,
  isGuestPublicId,
  safeGoogleReviewUrl,
} from "./guest-feedback";

test("guest public IDs require a high-entropy URL-safe locator shape", () => {
  assert.equal(isGuestPublicId("AbCdEfGhIjKlMnOpQrStUvWxYz12_345"), true);
  assert.equal(isGuestPublicId("short"), false);
  assert.equal(isGuestPublicId("id with spaces that is long enough"), false);
});

test("Google review destinations accept HTTPS Google destinations only", () => {
  assert.equal(safeGoogleReviewUrl("https://g.page/r/example"), "https://g.page/r/example");
  assert.equal(safeGoogleReviewUrl("https://www.google.com/maps"), "https://www.google.com/maps");
  assert.equal(safeGoogleReviewUrl("https://maps.app.goo.gl/example"), "https://maps.app.goo.gl/example");
  assert.equal(safeGoogleReviewUrl("http://google.com/review"), null);
  assert.equal(safeGoogleReviewUrl("https://google.com.attacker.test/review"), null);
  assert.equal(safeGoogleReviewUrl("javascript:alert(1)"), null);
});

test("guest ratings map between one-to-five values and stored enum values", () => {
  assert.equal(feedbackRatingValue(1), "ONE");
  assert.equal(feedbackRatingValue(5), "FIVE");
  assert.equal(feedbackRatingScore("THREE"), 3);
  assert.equal(feedbackRatingScore("UNKNOWN"), 0);
});

test("submission keys are HMAC hashed and scoped to one QR code", () => {
  const secret = "a".repeat(48);
  const first = hashGuestSubmissionKey("qr-a", "00000000-0000-4000-8000-000000000001", secret);
  assert.equal(first, hashGuestSubmissionKey("qr-a", "00000000-0000-4000-8000-000000000001", secret));
  assert.notEqual(first, hashGuestSubmissionKey("qr-b", "00000000-0000-4000-8000-000000000001", secret));
  assert.notEqual(first, "00000000-0000-4000-8000-000000000001");
  assert.throws(() => hashGuestSubmissionKey("qr-a", "key", "short"));
});
