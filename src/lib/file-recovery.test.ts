import test from "node:test";
import assert from "node:assert/strict";
import { getPermanentErasureEligibleAt, isPermanentErasureEligible, parseFileRecoveryPolicy } from "./file-recovery";

test("permanent erasure remains disabled for missing or invalid retention policy", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "3651", "NaN", " 30", "30days"]) {
    assert.equal(parseFileRecoveryPolicy(value), null, String(value));
  }
});

test("accepts only whole-day retention values from one through 3650", () => {
  assert.deepEqual(parseFileRecoveryPolicy("1"), { retentionDays: 1 });
  assert.deepEqual(parseFileRecoveryPolicy("3650"), { retentionDays: 3650 });
});

test("erasure eligibility begins exactly at the retention boundary", () => {
  const policy = { retentionDays: 30 };
  const deletedAt = new Date("2026-01-01T12:00:00.000Z");
  const eligibleAt = getPermanentErasureEligibleAt(deletedAt, policy);
  assert.equal(eligibleAt.toISOString(), "2026-01-31T12:00:00.000Z");
  assert.equal(isPermanentErasureEligible(deletedAt, new Date(eligibleAt.getTime() - 1), policy), false);
  assert.equal(isPermanentErasureEligible(deletedAt, eligibleAt, policy), true);
  assert.equal(isPermanentErasureEligible(deletedAt, new Date(eligibleAt.getTime() + 1), policy), true);
});
