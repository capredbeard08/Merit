import type { Prisma } from "@prisma/client";

export const platformSecurityEventTypes = [
  "FOUNDER_SUPER_ADMIN_BOOTSTRAPPED",
  "PLATFORM_ACCESS_GRANTED",
  "PLATFORM_ACCESS_REINSTATED",
  "PLATFORM_ACCESS_REVOKED",
] as const;

export type SafePlatformSecurityEvent = {
  id: string;
  type: string;
  severity: string;
  actorUserId: string | null;
  targetId: string | null;
  metadata: Record<string, string>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

/**
 * Expose only a narrow allow-list of operational metadata. Never return raw
 * event JSON: future producers may add secrets, tokens, or customer content.
 */
export function sanitizePlatformEventMetadata(
  value: Prisma.JsonValue | null,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Prisma.JsonObject;
  const allowed = ["role", "previousRole", "reason", "accessId"] as const;
  const safe: Record<string, string> = {};
  for (const key of allowed) {
    const item = source[key];
    if (typeof item === "string" && item.length <= 160) safe[key] = item;
  }
  return safe;
}

export function escapeCsvCell(value: string | null | undefined): string {
  const safe = value ?? "";
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function platformEventsToCsv(events: SafePlatformSecurityEvent[]): string {
  const header = ["Timestamp (UTC)", "Event", "Severity", "Actor user ID", "Target user ID", "Role", "Previous role", "Reason", "IP address", "User agent"];
  const rows = events.map((event) => [
    event.createdAt.toISOString(),
    event.type,
    event.severity,
    event.actorUserId ?? "",
    event.targetId ?? "",
    event.metadata.role ?? "",
    event.metadata.previousRole ?? "",
    event.metadata.reason ?? "",
    event.ipAddress ?? "",
    event.userAgent ?? "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(",")).join("\r\n");
}
