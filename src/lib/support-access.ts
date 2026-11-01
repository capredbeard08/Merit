import { Prisma, type SupportAccessScope } from "@prisma/client";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform } from "@/lib/platform-access";
import { isSupportAuthorizationActive } from "@/lib/support-access-policy";
export { isSupportAuthorizationActive } from "@/lib/support-access-policy";

export async function executeApprovedSupportReadInTransaction<T>(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    workspaceId: string;
    scope: SupportAccessScope;
    targetType: string;
    targetId?: string;
    read: (tx: Prisma.TransactionClient, requestId: string) => Promise<T>;
  },
  now = new Date(),
): Promise<
  | { authorized: true; requestId: string; data: T }
  | { authorized: false; reason: "platform_access_inactive" | "business_approval_missing" }
> {
  const platformAccess = await tx.platformAccess.findUnique({
    where: { userId: input.actorUserId },
    select: { role: true, revokedAt: true },
  });
  if (!canAccessPlatform(platformAccess, "platform:security:read")) {
    return { authorized: false, reason: "platform_access_inactive" };
  }

  const grant = await tx.supportAccessRequest.findFirst({
    where: {
      workspaceId: input.workspaceId,
      requestedByUserId: input.actorUserId,
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
    userId: input.actorUserId,
    scope: input.scope,
    now,
  })) {
    return { authorized: false, reason: "business_approval_missing" };
  }

  // The caller's workspace-constrained data query executes before this
  // transaction commits, under the same serializable snapshot as the grant check.
  const data = await input.read(tx, grant.id);

  await tx.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "SUPPORT_ACCESS_USED",
      targetType: input.targetType.slice(0, 80),
      targetId: input.targetId?.slice(0, 128) ?? null,
      metadata: { supportAccessRequestId: grant.id, scope: input.scope, accessMode: "READ" },
    },
  });

  return { authorized: true, requestId: grant.id, data };
}

/**
 * Execute the data query in the same serializable transaction that checks
 * platform access and the exact business-approved grant. The callback MUST
 * constrain every returned row to input.workspaceId and the requested scope.
 * Never split this into a permission check followed by an independent query.
 * A serialization conflict must fail closed; callers should return a retryable
 * response rather than falling back to an unguarded query.
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
    const result = await executeApprovedSupportReadInTransaction(tx, {
      actorUserId: session.user.id,
      workspaceId: input.workspaceId,
      scope: input.scope,
      targetType: input.targetType,
      targetId: input.targetId,
      read: input.read,
    });
    if (!result.authorized) {
      return {
        authorized: false as const,
        response: Response.json({
          error: result.reason === "platform_access_inactive"
            ? "Active platform access required"
            : "Business approval is missing, expired, or revoked",
        }, { status: 403 }),
      };
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
