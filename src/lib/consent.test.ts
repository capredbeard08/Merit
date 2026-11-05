import test from "node:test";
import assert from "node:assert/strict";
import { canCreateFeedbackRequest } from "./security";

test("a customer with no opt-out can receive feedback when consent is present", () => {
  assert.equal(canCreateFeedbackRequest(true, null), true);
});

test("a service event without feedback consent cannot create a feedback request", () => {
  assert.equal(canCreateFeedbackRequest(false, null), false);
});

test("a later integration consent flag cannot reverse an explicit customer opt-out", () => {
  assert.equal(canCreateFeedbackRequest(true, new Date("2026-11-01T10:00:00.000Z")), false);
});

test("an opted-out customer remains opted out when an event has no feedback consent", () => {
  assert.equal(canCreateFeedbackRequest(false, new Date("2026-11-01T10:00:00.000Z")), false);
});
