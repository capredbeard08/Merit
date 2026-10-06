import { prisma } from "@/lib/prisma";

type AuditInput = {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
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
      metadata: input.metadata,
      ipAddress: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers?.get("x-real-ip") ?? null,
      userAgent: headers?.get("user-agent")?.slice(0, 1000) ?? null,
    },
  });
}
