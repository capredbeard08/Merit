import test from "node:test";
import assert from "node:assert/strict";
import { isSecurityArtifactActionAllowed } from "./security-warden-artifact-policy";
import { securityActionScopeMatches } from "./security-warden-scope-policy";
import {
  canTransitionIncident,
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
  scopeHash: "c".repeat(64),
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
    authority, approval, requestedAction: "DISPOSE", requestedArtifactHash: hash, requestedScopeHash: "c".repeat(64),
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), true);
  assert.equal(isFounderApprovalUsable({
    authority: { ...authority, hasFreshMfa: false }, approval,
    requestedAction: "DISPOSE", requestedArtifactHash: hash, requestedScopeHash: "c".repeat(64),
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), false);
  assert.equal(isFounderApprovalUsable({
    authority: { ...authority, isFounderSuperAdmin: false }, approval,
    requestedAction: "DISPOSE", requestedArtifactHash: hash, requestedScopeHash: "c".repeat(64),
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), false);
});

test("approval cannot be reused for another action or artifact", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "SAFE_UNPACK", requestedArtifactHash: hash, requestedScopeHash: "c".repeat(64), now,
  }), false);
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "DISPOSE", requestedArtifactHash: "b".repeat(64), requestedScopeHash: "c".repeat(64), now,
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
      authority, approval: changed, requestedAction: "DISPOSE", requestedArtifactHash: hash, requestedScopeHash: "c".repeat(64), now,
    }), false);
  }
});

test("quarantined files are released only after a durable clean verdict", () => {
  assert.equal(mayReleaseArtifact("QUARANTINED", "CLEAN"), true);
  assert.equal(mayReleaseArtifact("QUARANTINED", "UNKNOWN"), false);
  assert.equal(mayReleaseArtifact("QUARANTINED", "MALICIOUS"), false);
  assert.equal(mayReleaseArtifact("AVAILABLE", "CLEAN"), false);
});

test("incident transitions reject skipping approval or reopening a closed case", () => {
  assert.equal(canTransitionIncident("OPEN", "TRIAGED"), true);
  assert.equal(canTransitionIncident("INVESTIGATING", "AWAITING_APPROVAL"), true);
  assert.equal(canTransitionIncident("OPEN", "RESOLVED"), false);
  assert.equal(canTransitionIncident("CLOSED", "OPEN"), false);
  assert.equal(canTransitionIncident("FALSE_POSITIVE", "TRIAGED"), true);
});

test("approval cannot be replayed with a different operation scope", () => {
  assert.equal(isFounderApprovalUsable({
    authority, approval, requestedAction: "DISPOSE",
    requestedArtifactHash: hash, requestedScopeHash: "d".repeat(64),
    now: new Date("2026-11-04T00:00:00.000Z"),
  }), false);
});

test("artifact restoration requires a clean scanner verdict", () => {
  assert.equal(isSecurityArtifactActionAllowed("RESTORE", "QUARANTINED", "CLEAN"), true);
  assert.equal(isSecurityArtifactActionAllowed("RESTORE", "QUARANTINED", "UNKNOWN"), false);
  assert.equal(isSecurityArtifactActionAllowed("RESTORE", "QUARANTINED", "ERROR"), false);
  assert.equal(isSecurityArtifactActionAllowed("RESTORE", "RETAINED", "MALICIOUS"), false);
});

test("analysis and disposal remain restricted to quarantined or retained artifacts", () => {
  assert.equal(isSecurityArtifactActionAllowed("SAFE_UNPACK", "QUARANTINED", "UNKNOWN"), true);
  assert.equal(isSecurityArtifactActionAllowed("DEOBFUSCATE", "ANALYSIS_APPROVED", "UNKNOWN"), true);
  assert.equal(isSecurityArtifactActionAllowed("DISPOSE", "RETAINED", "MALICIOUS"), true);
  assert.equal(isSecurityArtifactActionAllowed("DISPOSE", "AVAILABLE" as never, "UNKNOWN"), false);
});

test("approval scope must name the exact operation and artifact", () => {
  const scope = { operation: "DISPOSE", artifactId: "artifact-1" };
  assert.equal(securityActionScopeMatches(scope, "DISPOSE", "artifact-1"), true);
  assert.equal(securityActionScopeMatches(scope, "RESTORE", "artifact-1"), false);
  assert.equal(securityActionScopeMatches(scope, "DISPOSE", "artifact-2"), false);
});
