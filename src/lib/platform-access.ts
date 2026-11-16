export const platformAccessRoles = [
  "FOUNDER_SUPER_ADMIN",
  "PLATFORM_ADMIN",
  "ENGINEER",
] as const;

export type PlatformAccessRole = (typeof platformAccessRoles)[number];

/**
 * Platform-console capabilities only. Deliberately excludes all workspace
 * customer-data permissions; those require a separate, business-approved grant.
 */
export const platformCapabilities = [
  "platform:users:read",
  "platform:users:manage",
  "platform:security:read",
  "platform:security:approve",
  "platform:audit:export",
  "platform:access:grant",
  "platform:access:revoke",
  "platform:deployments:read",
] as const;

export type PlatformCapability = (typeof platformCapabilities)[number];

const capabilities: Record<PlatformAccessRole, readonly PlatformCapability[]> = {
  FOUNDER_SUPER_ADMIN: [...platformCapabilities],
  PLATFORM_ADMIN: ["platform:users:read", "platform:security:read"],
  ENGINEER: ["platform:security:read", "platform:deployments:read"],
};

export type PlatformAccessRecord = {
  role: string;
  revokedAt: Date | null;
};

/** Fail closed for missing, revoked, or unknown platform access records. */
export function canAccessPlatform(
  access: PlatformAccessRecord | null | undefined,
  capability: PlatformCapability,
): boolean {
  if (!access || access.revokedAt !== null) return false;
  if (!platformAccessRoles.includes(access.role as PlatformAccessRole)) return false;
  return capabilities[access.role as PlatformAccessRole].includes(capability);
}
