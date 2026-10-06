export const roles = ["owner", "admin", "manager", "agent", "viewer"] as const;
export type Role = (typeof roles)[number];

export const permissionNames = [
  "workspace:manage",
  "members:manage",
  "branches:manage",
  "branches:read",
  "feedback:read",
  "feedback:write",
  "integrations:manage",
  "ai:use",
] as const;

export type Permission = (typeof permissionNames)[number];

const permissions: Record<Role, readonly Permission[]> = {
  owner: ["workspace:manage", "members:manage", "branches:manage", "branches:read", "feedback:read", "feedback:write", "integrations:manage", "ai:use"],
  admin: ["members:manage", "branches:manage", "branches:read", "feedback:read", "feedback:write", "integrations:manage", "ai:use"],
  manager: ["branches:read", "feedback:read", "feedback:write", "ai:use"],
  agent: ["feedback:read", "feedback:write"],
  viewer: ["feedback:read"],
};

export function can(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}

export function assertWorkspaceRole(role: Role, required: Permission) {
  if (!can(role, required)) {
    throw new Error("FORBIDDEN");
  }
}
