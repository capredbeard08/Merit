import test from "node:test";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { GET } from "../app/api/feedback/[id]/click/route";
import { createFeedbackToken, FEEDBACK_TOKEN_TTL_SECONDS, verifyFeedbackToken } from "./feedback-token";

process.env.AUTH_SECRET = "feedback-link-test-secret-that-is-not-production";
process.env.NEXT_PUBLIC_APP_URL = "https://merit.example.test";

test("feedback link GET validates and redirects without requiring a database write", async () => {
  const id = "feedback-test-123";
  const token = createFeedbackToken(id);
  const response = await GET(
    new Request("https://merit.example.test/api/feedback/" + id + "/click?t=" + encodeURIComponent(token)),
    { params: Promise.resolve({ id }) },
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://merit.example.test/feedback/" + id + "?t=" + encodeURIComponent(token),
  );
});

test("feedback link GET rejects an invalid capability", async () => {
  const id = "feedback-test-456";
  const response = await GET(
    new Request("https://merit.example.test/api/feedback/" + id + "/click?t=invalid-token"),
    { params: Promise.resolve({ id }) },
  );

  assert.equal(response.status, 404);
});


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

test("legacy feedback tokens are accepted only within the sent feedback grace period", () => {
  const id = "feedback-legacy-test";
  const now = 1_700_000_000;
  const token = createHmac("sha256", process.env.AUTH_SECRET!).update(id).digest("base64url");
  const recentSentAt = new Date((now - FEEDBACK_TOKEN_TTL_SECONDS + 10) * 1000);
  const expiredSentAt = new Date((now - FEEDBACK_TOKEN_TTL_SECONDS - 1) * 1000);

  assert.equal(verifyFeedbackToken(id, token, recentSentAt, now), true);
  assert.equal(verifyFeedbackToken(id, token, expiredSentAt, now), false);
  assert.equal(verifyFeedbackToken(id, token, null, now), false);
});
