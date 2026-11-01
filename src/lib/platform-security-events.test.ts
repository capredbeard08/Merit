import test from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell, platformEventsToCsv, sanitizePlatformEventMetadata } from "./platform-security-events";

test("security event metadata is allow-listed and bounded", () => {
  const safe = sanitizePlatformEventMetadata({
    role: "ENGINEER",
    previousRole: "PLATFORM_ADMIN",
    reason: "founder_granted_operator_access",
    secret: "must-not-leak",
    customerEmail: "customer@example.com",
    oversized: "x".repeat(200),
  });
  assert.deepEqual(safe, {
    role: "ENGINEER",
    previousRole: "PLATFORM_ADMIN",
    reason: "founder_granted_operator_access",
  });
});

test("non-object event metadata returns an empty object", () => {
  assert.deepEqual(sanitizePlatformEventMetadata(null), {});
  assert.deepEqual(sanitizePlatformEventMetadata("private"), {});
  assert.deepEqual(sanitizePlatformEventMetadata(["private"]), {});
});

test("CSV cells are quoted and formula-like strings remain text", () => {
  assert.equal(escapeCsvCell('hello,"world"'), '"hello,""world"""');
  assert.equal(escapeCsvCell("=1+1"), "\"'=1+1\"");
  assert.equal(escapeCsvCell("  @SUM(1,1)"), "\"  '@SUM(1,1)\"");
});

test("CSV export contains only the approved event columns", () => {
  const csv = platformEventsToCsv([{
    id: "event-1",
    type: "PLATFORM_ACCESS_GRANTED",
    severity: "HIGH",
    actorUserId: "actor-1",
    targetId: "target-1",
    metadata: { role: "ENGINEER", reason: "founder_granted_operator_access" },
    ipAddress: null,
    userAgent: null,
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
  }]);
  assert.match(csv, /Timestamp \(UTC\),/);
  assert.match(csv, /PLATFORM_ACCESS_GRANTED/);
  assert.match(csv, /ENGINEER/);
  assert.doesNotMatch(csv, /secret|customerEmail/);
});
