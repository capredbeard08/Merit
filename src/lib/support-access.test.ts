import test from "node:test";
import assert from "node:assert/strict";
import { isSupportAuthorizationActive } from "./support-access-policy";

const now = new Date("2026-11-01T12:00:00.000Z");
const approved = {
  workspaceId: "workspace-1",
  requestedByUserId: "operator-1",
  scope: "FEEDBACK_READ",
  status: "APPROVED",
  revokedAt: null,
  expiresAt: new Date("2026-11-01T13:00:00.000Z"),
};

test("only an exact, active business-approved scope authorizes access", () => {
  assert.equal(isSupportAuthorizationActive(approved, {
    workspaceId: "workspace-1", userId: "operator-1", scope: "FEEDBACK_READ", now,
  }), true);
});

test("support authorization fails closed for another workspace, operator, or scope", () => {
  assert.equal(isSupportAuthorizationActive(approved, {
    workspaceId: "workspace-2", userId: "operator-1", scope: "FEEDBACK_READ", now,
  }), false);
  assert.equal(isSupportAuthorizationActive(approved, {
    workspaceId: "workspace-1", userId: "operator-2", scope: "FEEDBACK_READ", now,
  }), false);
  assert.equal(isSupportAuthorizationActive(approved, {
    workspaceId: "workspace-1", userId: "operator-1", scope: "FILE_ASSETS_READ", now,
  }), false);
});

test("pending, denied, revoked, missing-expiry, and expired grants fail closed", () => {
  for (const patch of [
    { status: "PENDING" },
    { status: "DENIED" },
    { revokedAt: new Date("2026-11-01T11:59:00.000Z") },
    { expiresAt: null },
    { expiresAt: new Date("2026-11-01T12:00:00.000Z") },
  ]) {
    assert.equal(isSupportAuthorizationActive({ ...approved, ...patch }, {
      workspaceId: "workspace-1", userId: "operator-1", scope: "FEEDBACK_READ", now,
    }), false);
  }
  assert.equal(isSupportAuthorizationActive(null, {
    workspaceId: "workspace-1", userId: "operator-1", scope: "FEEDBACK_READ", now,
  }), false);
});
