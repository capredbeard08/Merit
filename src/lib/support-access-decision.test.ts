import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSupportAccessDecision } from "./support-access-decision";

const now = new Date("2026-11-01T12:00:00.000Z");
const pending = {
  requestedByUserId: "operator-1",
  status: "PENDING",
  requestExpiresAt: new Date("2026-11-01T13:00:00.000Z"),
  expiresAt: null,
};
const approved = {
  ...pending,
  status: "APPROVED",
  expiresAt: new Date("2026-11-01T13:00:00.000Z"),
};
const activeOperator = { role: "ENGINEER", revokedAt: null };

test("only a different workspace member can decide a live pending request", () => {
  assert.equal(evaluateSupportAccessDecision({
    decision: "APPROVE", request: pending, actorUserId: "owner-1",
    operatorAccess: activeOperator, now,
  }), "allowed");
  assert.equal(evaluateSupportAccessDecision({
    decision: "DENY", request: pending, actorUserId: "owner-1", now,
  }), "allowed");
});

test("requester cannot approve or deny their own request", () => {
  for (const decision of ["APPROVE", "DENY", "REVOKE"] as const) {
    assert.equal(evaluateSupportAccessDecision({
      decision, request: approved, actorUserId: "operator-1",
      operatorAccess: activeOperator, now,
    }), "self_approval");
  }
});

test("expired or non-pending requests cannot be approved or denied", () => {
  for (const request of [
    { ...pending, status: "DENIED" },
    { ...pending, requestExpiresAt: new Date("2026-11-01T12:00:00.000Z") },
    { ...pending, requestExpiresAt: new Date("2026-11-01T11:59:00.000Z") },
  ]) {
    assert.equal(evaluateSupportAccessDecision({
      decision: "APPROVE", request, actorUserId: "owner-1",
      operatorAccess: activeOperator, now,
    }), "not_pending");
    assert.equal(evaluateSupportAccessDecision({
      decision: "DENY", request, actorUserId: "owner-1", now,
    }), "not_pending");
  }
});

test("only a live approved request can be revoked", () => {
  assert.equal(evaluateSupportAccessDecision({
    decision: "REVOKE", request: approved, actorUserId: "owner-1", now,
  }), "allowed");
  for (const request of [
    { ...approved, status: "PENDING" },
    { ...approved, expiresAt: null },
    { ...approved, expiresAt: new Date("2026-11-01T12:00:00.000Z") },
    { ...approved, expiresAt: new Date("2026-11-01T11:59:00.000Z") },
  ]) {
    assert.equal(evaluateSupportAccessDecision({
      decision: "REVOKE", request, actorUserId: "owner-1", now,
    }), "not_active");
  }
});

test("inactive or revoked platform operators cannot receive approval", () => {
  for (const operatorAccess of [
    null,
    { role: "ENGINEER", revokedAt: new Date("2026-11-01T11:00:00.000Z") },
    { role: "UNKNOWN", revokedAt: null },
  ]) {
    assert.equal(evaluateSupportAccessDecision({
      decision: "APPROVE", request: pending, actorUserId: "owner-1",
      operatorAccess, now,
    }), "operator_inactive");
  }
});
