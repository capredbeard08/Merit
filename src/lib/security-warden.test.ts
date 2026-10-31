import test from "node:test";
import assert from "node:assert/strict";
import { getSecuritySeverity, sanitizeSecurityMetadata } from "./security-warden";

test("classifies cross-workspace access as high severity", () => {
  assert.equal(getSecuritySeverity("CROSS_WORKSPACE_ACCESS"), "HIGH");
});

test("drops secret and customer-content fields from event metadata", () => {
  const result = sanitizeSecurityMetadata({
    route: "/api/feedback",
    token: "do-not-store",
    customerEmail: "person@example.com",
    message: "private feedback",
    count: 3,
    active: true,
  });
  assert.deepEqual(result, { route: "/api/feedback", count: 3, active: true });
});

test("does not allow caller-supplied severity to survive metadata sanitization", () => {
  const result = sanitizeSecurityMetadata({ severity: "LOW", route: "/api/admin" });
  assert.deepEqual(result, { route: "/api/admin" });
});

test("bounds metadata key count and string length", () => {
  const result = sanitizeSecurityMetadata({
    longValue: "x".repeat(500),
    ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`field${i}`, i])),
  });
  assert.equal((result.longValue as string).length, 240);
  assert.equal(Object.keys(result).length, 20);
});
