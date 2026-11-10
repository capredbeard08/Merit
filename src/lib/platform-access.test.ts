import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPlatform } from "./platform-access";

const active = (role: string) => ({ role, revokedAt: null });

test("founder super admin receives platform-console capabilities", () => {
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), "platform:access:grant"), true);
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), "platform:users:manage"), true);
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), "platform:access:revoke"), true);
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), "platform:audit:export"), true);
});

test("platform administrators cannot grant platform access", () => {
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:users:manage"), false);
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:access:grant"), false);
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:access:revoke"), false);
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:audit:export"), false);
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:deployments:read"), false);
});

test("engineers receive technical visibility but not user administration", () => {
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:security:read"), true);
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:audit:export"), false);
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:deployments:read"), true);
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:users:read"), false);
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:users:manage"), false);
});

test("platform roles never imply workspace customer-data access", () => {
  const workspaceDataCapability = "workspace:feedback:read";
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), workspaceDataCapability as never), false);
});

test("revoked, absent, and unknown access records fail closed", () => {
  assert.equal(canAccessPlatform(null, "platform:security:read"), false);
  assert.equal(canAccessPlatform(active("UNKNOWN"), "platform:security:read"), false);
  assert.equal(canAccessPlatform({ role: "ENGINEER", revokedAt: new Date() }, "platform:security:read"), false);
});
test("Founder approval capability is exclusive to the Founder Super Admin", () => {
  assert.equal(canAccessPlatform(active("FOUNDER_SUPER_ADMIN"), "platform:security:approve"), true);
  assert.equal(canAccessPlatform(active("PLATFORM_ADMIN"), "platform:security:approve"), false);
  assert.equal(canAccessPlatform(active("ENGINEER"), "platform:security:approve"), false);
});

