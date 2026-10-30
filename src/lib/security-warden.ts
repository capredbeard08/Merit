import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const securityEventTypes = [
  "AUTH_FAILURE",
  "AUTHZ_DENIED",
  "CROSS_WORKSPACE_ACCESS",
  "RATE_LIMIT_TRIGGERED",
  "PUBLIC_SUBMISSION_REJECTED",
  "WEBHOOK_AUTH_FAILURE",
  "UPLOAD_QUARANTINED",
  "INVITATION_REPLAY",
  "SUSPICIOUS_INPUT",
] as const;

export type SecurityEventType = (typeof securityEventTypes)[number];
export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const severityByType: Record<SecurityEventType, SecuritySeverity> = {
  AUTH_FAILURE: "MEDIUM",
  AUTHZ_DENIED: "MEDIUM",
  CROSS_WORKSPACE_ACCESS: "HIGH",
  RATE_LIMIT_TRIGGERED: "MEDIUM",
  PUBLIC_SUBMISSION_REJECTED: "LOW",
  WEBHOOK_AUTH_FAILURE: "HIGH",
  UPLOAD_QUARANTINED: "MEDIUM",
  INVITATION_REPLAY: "HIGH",
  SUSPICIOUS_INPUT: "MEDIUM",
};

const secretKeyPattern = /password|secret|token|authorization|cookie|email|phone|message|payload|content|api.?key/i;
const MAX_METADATA_KEYS = 20;
const MAX_STRING_LENGTH = 240;

export function sanitizeSecurityMetadata(metadata: Record<string, unknown> = {}): Prisma.InputJsonObject {
  const safe: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, MAX_METADATA_KEYS)) {
    // Severity is derived from the event type and must never be caller-controlled.
    if (key.toLowerCase() === "severity" || secretKeyPattern.test(key)) continue;
    if (typeof value === "string") safe[key.slice(0, 64)] = value.slice(0, MAX_STRING_LENGTH);
    else if (typeof value === "number" && Number.isFinite(value)) safe[key.slice(0, 64)] = value;
    else if (typeof value === "boolean") safe[key.slice(0, 64)] = value;
  }
  return safe;
}

export function getSecuritySeverity(type: SecurityEventType): SecuritySeverity {
  return severityByType[type];
}

type RecordSecurityEventInput = {
  type: SecurityEventType;
  workspaceId?: string | null;
  actorUserId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

export async function recordSecurityEvent(input: RecordSecurityEventInput): Promise<void> {
  const severity = getSecuritySeverity(input.type);
  const metadata = { ...sanitizeSecurityMetadata(input.metadata), severity };
  const headers = input.request?.headers;
  const ipAddress =
    headers?.get("x-real-ip")?.slice(0, 64) ??
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ??
    null;
  const userAgent = headers?.get("user-agent")?.slice(0, 300) ?? null;

  if (!input.workspaceId) {
    // Until a platform-level security-event store is added, do not pretend a
    // console log is durable monitoring. Emit a structured operational warning.
    console.error(JSON.stringify({
      component: "MERIT_SECURITY_WARDEN_UNSCOPED_EVENT",
      type: input.type,
      severity,
      metadata,
      ipAddress,
      userAgent,
      occurredAt: new Date().toISOString(),
    }));
    return;
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: `SECURITY:${input.type}`,
      targetType: "SECURITY_EVENT",
      targetId: input.targetId ?? null,
      metadata,
      ipAddress,
      userAgent,
    },
  });
}
