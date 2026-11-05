import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/feedback/[id]/click/route";
import { createFeedbackToken } from "./feedback-token";

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
