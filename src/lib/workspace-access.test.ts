import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceMembership } from "./workspace-access";

const memberships = [{ workspaceId: "workspace-a", role: "OWNER" }, { workspaceId: "workspace-b", role: "VIEWER" }];

test("defaults to the first membership only when no workspace is requested", () => {
  assert.equal(resolveWorkspaceMembership(memberships)?.workspaceId, "workspace-a");
});

test("selects a requested workspace only from the user's memberships", () => {
  assert.equal(resolveWorkspaceMembership(memberships, "workspace-b")?.workspaceId, "workspace-b");
});

test("rejects a workspace the user does not belong to", () => {
  assert.equal(resolveWorkspaceMembership(memberships, "workspace-secret"), null);
});

test("fails closed when the user has no memberships", () => {
  assert.equal(resolveWorkspaceMembership([], "workspace-a"), null);
});
