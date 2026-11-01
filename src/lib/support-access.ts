import { Prisma, type SupportAccessScope } from "@prisma/client";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform } from "@/lib/platform-access";
import { isSupportAuthorizationActive } from "@/lib/support-access-policy";
export { isSupportAuthorizationActive } from "@/lib/support-access-policy";

/**
 * Execute a support-data read in the same serializable transaction that checks
 * platform access and the exact business-approved grant. The query callback
 * MUST constrain every returned row to input.workspaceId and the requested
 * scope. Do not split authorization and data retrieval into separate calls:
 * doing so creates a revocation time-of-check/time-of-use window.
 *
 * A serialization conflict fails the operation; callers should surface a
 * retryable response and must never fall back to an unguarded query.
 */
export async function withApprovedSupportRead<T>(input: {
  request: Request;
  workspaceId: string;
  scope: SupportAccessScope;
  targetType: string;
  targetId?: string;
  read: (tx: Prisma.TransactionClient, requestId: string) => Promise<T>;
}): Promise<
  | { authorized: true; requestId: string; data: T }
  | { authorized: false; response: Response }
> {
  const session = await auth.api.getSession({ headers: input.request.headers });
  if (!session?.user) {
    return { authorized: false, response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  }

  return prisma.$transaction(async (tx) => {
    const platformAccess = await tx.platformAccess.findUnique({
      where: { userId: session.user.id },
      select: { role: true, revokedAt: true },
    });
    if (!canAccessPlatform(platformAccess, "platform:security:read")) {
      return { authorized: false as const, response: Response.json({ error: "Active platform access required" }, { status: 403 }) };
    }

    const now = new Date();
    const grant = await tx.supportAccessRequest.findFirst({
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

    if (!grant || !isSupportAuthorizationActive(grant, {
      workspaceId: input.workspaceId,
      userId: session.user.id,
      scope: input.scope,
      now,
    })) {
      return { authorized: false as const, response: Response.json({ error: "Business approval is missing, expired, or revoked" }, { status: 403 }) };
    }

    const data = await input.read(tx, grant.id);

    await tx.auditLog.create({
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

    return { authorized: true as const, requestId: grant.id, data };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
