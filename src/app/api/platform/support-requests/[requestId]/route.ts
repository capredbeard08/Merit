export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const { requestId } = await context.params;
  if (!requestId || requestId.length > 128) return NextResponse.json({ error: "Invalid request identifier" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const supportRequest = await tx.supportAccessRequest.findFirst({
        where: { id: requestId, requestedByUserId: session.user.id },
        select: { id: true, workspaceId: true, scope: true, status: true, expiresAt: true },
      });
      if (!supportRequest) return { kind: "not_found" as const };
      if (supportRequest.status !== "PENDING" && supportRequest.status !== "APPROVED") {
        return { kind: "not_active" as const };
      }
      if (supportRequest.status === "APPROVED" && (!supportRequest.expiresAt || supportRequest.expiresAt <= new Date())) {
        return { kind: "not_active" as const };
      }

      const now = new Date();
      await tx.supportAccessRequest.update({
        where: { id: supportRequest.id },
        data: { status: "REVOKED", revokedAt: now, revokedByUserId: session.user.id },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: supportRequest.workspaceId,
          actorUserId: session.user.id,
          action: "SUPPORT_ACCESS_REVOKED",
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: supportRequest.id,
          metadata: { scope: supportRequest.scope, supportAccessRequestId: supportRequest.id, reason: "requester_revoked_or_cancelled" },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: session.user.id,
          type: "SUPPORT_ACCESS_REVOKED",
          severity: "HIGH",
          targetId: supportRequest.workspaceId,
          metadata: { supportAccessRequestId: supportRequest.id, scope: supportRequest.scope, reason: "requester_revoked_or_cancelled" },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
      return { kind: "revoked" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") return NextResponse.json({ error: "Support access request not found" }, { status: 404 });
    if (result.kind === "not_active") return NextResponse.json({ error: "This request is no longer active" }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "SUPPORT_ACCESS_REVOKE_FAILED";
    if (code === "P2034") return NextResponse.json({ error: "The request changed concurrently. Refresh and try again." }, { status: 409 });
    console.error("[MERIT support access] requester revoke failed", { code });
    return NextResponse.json({ error: "Unable to revoke support access" }, { status: 500 });
  }
}
