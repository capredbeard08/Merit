import test from "node:test";
import assert from "node:assert/strict";
import { canCreateFeedbackRequest, canDispatchFollowUp, FOLLOW_UP_IDEMPOTENCY_RETRY_WINDOW_MS } from "./security";

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


test("follow-up dispatch is allowed only for pending feedback with an email and no opt-out", () => {
  assert.equal(canDispatchFollowUp("PENDING", "customer@example.test", null), true);
  assert.equal(canDispatchFollowUp("REPLIED", "customer@example.test", null), false);
  assert.equal(canDispatchFollowUp("RESOLVED", "customer@example.test", null), false);
  assert.equal(canDispatchFollowUp("OPTED_OUT", "customer@example.test", null), false);
  assert.equal(canDispatchFollowUp("PENDING", null, null), false);
  assert.equal(canDispatchFollowUp("PENDING", "customer@example.test", new Date()), false);
});


test("follow-up retry safety window stays shorter than provider idempotency retention", () => {
  assert.equal(FOLLOW_UP_IDEMPOTENCY_RETRY_WINDOW_MS, 23 * 60 * 60 * 1000);
});
