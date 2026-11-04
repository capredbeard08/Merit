import test from "node:test";
import assert from "node:assert/strict";
import {
  isFounderApprovalUsable,
  mayReleaseArtifact,
  mayRunAutomatically,
  requiresFounderApproval,
} from "./security-warden-policy";

const hash = "a".repeat(64);
const authority = { isFounderSuperAdmin: true, hasFreshSession: true, hasFreshMfa: true };
const approval = {
  status: "APPROVED" as const,
  actionType: "DISPOSE" as const,
  artifactHash: hash,
  expiresAt: new Date("2026-11-05T00:00:00.000Z"),
  consumedAt: null,
};

test("only static analysis and quarantine are automatic actions", () => {
  assert.equal(mayRunAutomatically("STATIC_ANALYSIS"), true);
  assert.equal(mayRunAutomatically("QUARANTINE"), true);
  assert.equal(mayRunAutomatically("SAFE_UNPACK"), false);
  assert.equal(mayRunAutomatically("DEOBFUSCATE"), false);
  assert.equal(mayRunAutomatically("DISPOSE"), false);
});

test("unpacking, deobfuscation, restore and disposal require Founder approval", () => {
  for (const action of ["SAFE_UNPACK", "DEOBFUSCATE", "RESTORE", "DISPOSE"] as const) {
    assert.equal(requiresFounderApproval(action), true);
  }
  assert.equal(requiresFounderApproval("STATIC_ANALYSIS"), false);
});

test("approval is valid only for Founder with fresh session and MFA", () => {
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "DISPOSE", requestedArtifactHash: hash,
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), true);
  assert.equal(isFounderApprovalUsable({
    authority: { ...authority, hasFreshMfa: false }, approval,
    requestedAction: "DISPOSE", requestedArtifactHash: hash,
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), false);
  assert.equal(isFounderApprovalUsable({
    authority: { ...authority, isFounderSuperAdmin: false }, approval,
    requestedAction: "DISPOSE", requestedArtifactHash: hash,
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), false);
});

test("approval cannot be reused for another action or artifact", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "SAFE_UNPACK", requestedArtifactHash: hash, now,
  }), false);
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "DISPOSE", requestedArtifactHash: "b".repeat(64), now,
  }), false);
});

test("expired, consumed, malformed and non-approved grants fail closed", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  for (const changed of [
    { ...approval, expiresAt: now },
    { ...approval, consumedAt: now },
    { ...approval, artifactHash: "not-a-hash" },
    { ...approval, status: "PENDING" as const },
  ]) {
    assert.equal(isFounderApprovalUsable({
      authority, approval: changed, requestedAction: "DISPOSE", requestedArtifactHash: hash, now,
    }), false);
  }
});

test("quarantined files are released only after a durable clean verdict", () => {
  assert.equal(mayReleaseArtifact("QUARANTINED", "CLEAN"), true);
  assert.equal(mayReleaseArtifact("QUARANTINED", "UNKNOWN"), false);
  assert.equal(mayReleaseArtifact("QUARANTINED", "MALICIOUS"), false);
  assert.equal(mayReleaseArtifact("AVAILABLE", "CLEAN"), false);
});
