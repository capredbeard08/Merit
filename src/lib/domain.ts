export const roles = ["owner", "admin", "manager", "agent", "viewer"] as const;
export type Role = (typeof roles)[number];

const permissions: Record<Role, readonly string[]> = {
  owner: ["workspace:manage", "members:manage", "branches:manage", "feedback:read", "feedback:write", "integrations:manage", "ai:use"],
  admin: ["members:manage", "branches:manage", "feedback:read", "feedback:write", "integrations:manage", "ai:use"],
  manager: ["branches:read", "feedback:read", "feedback:write", "ai:use"],
  agent: ["feedback:read", "feedback:write"],
  viewer: ["feedback:read"],
};

export function can(role: Role, permission: string) {
  return permissions[role].includes(permission);
}


export function assertWorkspaceRole(
  role: Role,
  required: Permission,
) {
  if (!can(role, required)) {
    throw new Error("FORBIDDEN");
  }
}
