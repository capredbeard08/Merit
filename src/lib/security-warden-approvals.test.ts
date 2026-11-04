import test from "node:test";
import assert from "node:assert/strict";
import { hashSecurityActionScope } from "./security-warden-approvals";

test("approval scope hash is independent of object key insertion order", () => {
  const first = { action: "DISPOSE", artifact: { id: "artifact-1", sha256: "a".repeat(64) } };
  const second = { artifact: { sha256: "a".repeat(64), id: "artifact-1" }, action: "DISPOSE" };
  assert.equal(hashSecurityActionScope(first), hashSecurityActionScope(second));
});

test("approval scope hash changes when any operation detail changes", () => {
  const first = { action: "DISPOSE", artifact: "artifact-1", retainRecoveryCopy: true };
  const changed = { action: "DISPOSE", artifact: "artifact-1", retainRecoveryCopy: false };
  assert.notEqual(hashSecurityActionScope(first), hashSecurityActionScope(changed));
});

test("approval scope hash preserves array order because operation order is meaningful", () => {
  const first = { steps: ["inspect", "deobfuscate"] };
  const changed = { steps: ["deobfuscate", "inspect"] };
  assert.notEqual(hashSecurityActionScope(first), hashSecurityActionScope(changed));
});
