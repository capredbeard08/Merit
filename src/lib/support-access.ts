import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform } from "@/lib/platform-access";
import type { SupportAccessScope } from "@prisma/client";

export { isSupportAuthorizationActive } from "@/lib/support-access-policy";
import { isSupportAuthorizationActive } from "@/lib/support-access-policy";

/**
 * Gate for future support/investigation read routes. Call immediately before
 * every query that returns workspace data to a platform operator, and keep
 * that query constrained to the same workspace and approved resource scope.
 */
export async function requireApprovedSupportRead(input: {
  request: Request;
  workspaceId: string;
  scope: SupportAccessScope;
  targetType: string;
  targetId?: string;
}): Promise<{ authorized: true; requestId: string } | { authorized: false; response: Response }> {
  const session = await auth.api.getSession({ headers: input.request.headers });
  if (!session?.user) {
    return { authorized: false, response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const platformAccess = await prisma.platformAccess.findUnique({
    where: { userId: session.user.id },
    select: { role: true, revokedAt: true },
  });
  if (!canAccessPlatform(platformAccess, "platform:security:read")) {
    return { authorized: false, response: Response.json({ error: "Active platform access required" }, { status: 403 }) };
  }

  const now = new Date();
  const grant = await prisma.supportAccessRequest.findFirst({
    where: {
      workspaceId: input.workspaceId,
      requestedByUserId: session.user.id,
      scope: input.scope,
      status: "APPROVED",
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
    select: { id: true, workspaceId: true, requestedByUserId: true, scope: true, status: true, revokedAt: true, expiresAt: true },
  });

  if (!isSupportAuthorizationActive(grant, {
    workspaceId: input.workspaceId,
    userId: session.user.id,
    scope: input.scope,
    now,
  })) {
    return { authorized: false, response: Response.json({ error: "Business approval is missing, expired, or revoked" }, { status: 403 }) };
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: session.user.id,
      action: "SUPPORT_ACCESS_USED",
      targetType: input.targetType.slice(0, 80),
      targetId: input.targetId?.slice(0, 128) ?? null,
      metadata: { supportAccessRequestId: grant.id, scope: input.scope, accessMode: "READ" },
      ipAddress: input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
        ?? input.request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
      userAgent: input.request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  return { authorized: true, requestId: grant.id };
}
