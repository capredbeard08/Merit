import test from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest, matchesFounderBootstrapSecret } from "./founder-bootstrap";

const configured = "a-long-random-deployment-secret-with-at-least-32-bytes";

test("accepts only an exact configured bootstrap secret", () => {
  assert.equal(matchesFounderBootstrapSecret(configured, configured), true);
  assert.equal(matchesFounderBootstrapSecret("wrong-secret", configured), false);
  assert.equal(matchesFounderBootstrapSecret("", configured), false);
  assert.equal(matchesFounderBootstrapSecret(configured, undefined), false);
  assert.equal(matchesFounderBootstrapSecret(configured, "too-short"), false);
});

test("rejects secrets with a different byte length before constant-time comparison", () => {
  assert.equal(matchesFounderBootstrapSecret(configured + "x", configured), false);
  assert.equal(matchesFounderBootstrapSecret("short", configured), false);
});

test("accepts only an exact same-origin request", () => {
  assert.equal(isSameOriginRequest("https://merit-olive.vercel.app", "https://merit-olive.vercel.app/api/platform/bootstrap"), true);
  assert.equal(isSameOriginRequest("https://evil.example", "https://merit-olive.vercel.app/api/platform/bootstrap"), false);
  assert.equal(isSameOriginRequest(null, "https://merit-olive.vercel.app/api/platform/bootstrap"), false);
  assert.equal(isSameOriginRequest("not a url", "https://merit-olive.vercel.app/api/platform/bootstrap"), false);
});
