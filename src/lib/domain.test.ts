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

test("permanent file erasure is restricted to workspace owners", () => {
  assert.equal(can("owner", "files:erase"), true);
  assert.equal(can("admin", "files:erase"), false);
  assert.equal(can("manager", "files:erase"), false);
  assert.equal(can("agent", "files:erase"), false);
  assert.equal(can("viewer", "files:erase"), false);
});

test("unknown runtime roles fail closed", () => {
  assert.equal(can("unknown" as never, "files:erase"), false);
});
