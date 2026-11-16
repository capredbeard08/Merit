import test from "node:test";
import assert from "node:assert/strict";
import { can } from "./domain";

test("only owners and admins can recover soft-deleted files", () => {
  assert.equal(can("owner", "files:recover"), true);
  assert.equal(can("admin", "files:recover"), true);
  assert.equal(can("manager", "files:recover"), false);
  assert.equal(can("agent", "files:recover"), false);
  assert.equal(can("viewer", "files:recover"), false);
});

test("unknown runtime roles fail closed", () => {
  assert.equal(can("unknown" as never, "files:recover"), false);
});

test("Security Warden access is limited to workspace owners and administrators", () => {
  assert.equal(can("owner", "security:read"), true);
  assert.equal(can("admin", "security:read"), true);
  assert.equal(can("manager", "security:read"), false);
  assert.equal(can("agent", "security:read"), false);
  assert.equal(can("viewer", "security:read"), false);
});
