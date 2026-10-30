import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sanitizeSecurityMetadata } from "@/lib/security-warden";

type AuditInput = {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonObject;
  request?: Request;
};

export async function writeAuditLog(input: AuditInput) {
  const headers = input.request?.headers;
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? sanitizeSecurityMetadata(input.metadata as Record<string, unknown>) : undefined,
      ipAddress: headers?.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? headers?.get("x-real-ip")?.slice(0, 64) ?? null,
      userAgent: headers?.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}
