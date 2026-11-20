import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceMembership } from "./workspace-access";

const memberships = [
  { workspaceId: "workspace-a", role: "OWNER" },
  { workspaceId: "workspace-b", role: "ADMIN" },
];

test("workspace resolver defaults to the first authenticated membership", () => {
  assert.equal(resolveWorkspaceMembership(memberships)?.workspaceId, "workspace-a");
});

test("workspace resolver selects only an exact membership match", () => {
  assert.equal(resolveWorkspaceMembership(memberships, "workspace-b")?.workspaceId, "workspace-b");
});

test("workspace resolver rejects a workspace the user does not belong to", () => {
  assert.equal(resolveWorkspaceMembership(memberships, "workspace-c"), null);
});

test("workspace resolver fails closed when the user has no memberships", () => {
  assert.equal(resolveWorkspaceMembership([], "workspace-a"), null);
});
