import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createFeedbackToken,
  FEEDBACK_TOKEN_TTL_SECONDS,
  verifyFeedbackToken,
} from "./feedback-token";

const originalAuthSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "feedback-link-test-secret-that-is-not-production";

test("versioned feedback tokens expire after the configured lifetime", () => {
  const id = "feedback-expiry-test";
  const issuedAt = 1_700_000_000;
  const token = createFeedbackToken(id, issuedAt);

  assert.equal(verifyFeedbackToken(id, token, null, issuedAt + FEEDBACK_TOKEN_TTL_SECONDS - 1), true);
  assert.equal(verifyFeedbackToken(id, token, null, issuedAt + FEEDBACK_TOKEN_TTL_SECONDS), false);
  assert.equal(verifyFeedbackToken(id, token + "tampered", null, issuedAt + 10), false);
});

test("versioned feedback tokens reject timestamps too far in the future", () => {
  const now = 1_700_000_000;
  const token = createFeedbackToken("feedback-future-test", now + 61);
  assert.equal(verifyFeedbackToken("feedback-future-test", token, null, now), false);
});

test("legacy feedback tokens are accepted only within the successful-send grace period", () => {
  const id = "feedback-legacy-test";
  const now = 1_700_000_000;
  const token = createHmac("sha256", process.env.AUTH_SECRET!).update(id).digest("base64url");
  const recentSentAt = new Date((now - FEEDBACK_TOKEN_TTL_SECONDS + 10) * 1000);
  const expiredSentAt = new Date((now - FEEDBACK_TOKEN_TTL_SECONDS - 1) * 1000);

  assert.equal(verifyFeedbackToken(id, token, recentSentAt, now), true);
  assert.equal(verifyFeedbackToken(id, token, expiredSentAt, now), false);
  assert.equal(verifyFeedbackToken(id, token, null, now), false);
});

test("feedback token signing keys can rotate without invalidating live links", () => {
  const id = "feedback-key-rotation-test";
  const now = 1_700_000_000;
  const oldAuthSecret = process.env.AUTH_SECRET!;
  const oldToken = createFeedbackToken(id, now);
  const oldLegacy = createHmac("sha256", oldAuthSecret).update(id).digest("base64url");

  process.env.FEEDBACK_TOKEN_SECRET = "new-dedicated-feedback-secret";
  process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS = "previous-dedicated-feedback-secret," + oldAuthSecret;
  const previousSignature = createHmac("sha256", "previous-dedicated-feedback-secret")
    .update("merit-feedback-v2:" + id + ":" + now + ":" + (now + FEEDBACK_TOKEN_TTL_SECONDS))
    .digest("base64url");
  const previousToken = ["v2", now, now + FEEDBACK_TOKEN_TTL_SECONDS, previousSignature].join(".");
  const recentSentAt = new Date((now - 10) * 1000);

  assert.equal(verifyFeedbackToken(id, oldToken, null, now + 10), true);
  assert.equal(verifyFeedbackToken(id, previousToken, null, now + 10), true);
  assert.equal(verifyFeedbackToken(id, oldLegacy, recentSentAt, now), true);

  const newToken = createFeedbackToken(id, now);
  assert.equal(verifyFeedbackToken(id, newToken, null, now + 10), true);

  delete process.env.FEEDBACK_TOKEN_SECRET;
  delete process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS;
});

test("feedback token test restores its original authentication secret", () => {
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
});


test("the persisted first-attempt timestamp produces a stable token across retries", () => {
  const feedbackId = "feedback-stable-retry-test";
  const firstAttemptAt = 1_700_000_000;
  const firstAttemptToken = createFeedbackToken(feedbackId, firstAttemptAt);
  const retryToken = createFeedbackToken(feedbackId, firstAttemptAt);
  assert.equal(retryToken, firstAttemptToken);
});
