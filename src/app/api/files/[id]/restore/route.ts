import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";
import { sanitizeSecurityMetadata } from "@/lib/security-warden";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, status: true, deletedAt: true, priorStatus: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!can(member.role.toLowerCase() as Role, "files:recover")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!file.deletedAt || file.status !== "DELETED") {
    return NextResponse.json({ error: "File is not in the recovery area" }, { status: 409 });
  }

  // Match the exact deletion generation read above. A stale restore request
  // must not restore a file that was deleted again after this request began.
  let claim;
  try {
    claim = await withWorkspacePermission(
      file.workspaceId,
      session.user.id,
      "files:recover",
      async (tx) => {
        const restoredStatus = file.priorStatus || "AVAILABLE";
        const result = await tx.fileAsset.updateMany({
          where: {
            id: file.id,
            workspaceId: file.workspaceId,
            status: "DELETED",
            deletedAt: file.deletedAt,
            priorStatus: file.priorStatus,
          },
          data: {
            status: restoredStatus,
            deletedAt: null,
            deletedById: null,
            priorStatus: null,
          },
        });
        if (result.count !== 1) return 0;

        await tx.auditLog.create({
          data: {
            workspaceId: file.workspaceId,
            actorUserId: session.user.id,
            action: "FILE_RESTORED",
            targetType: "FILE_ASSET",
            targetId: file.id,
            metadata: sanitizeSecurityMetadata({ restoredStatus }),
            ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        return 1;
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
  if (claim !== 1) {
    return NextResponse.json({ error: "File recovery state changed; refresh and try again." }, { status: 409 });
  }
  const restored = await prisma.fileAsset.findUnique({
    where: { id: file.id },
    select: { id: true, originalName: true, status: true, updatedAt: true },
  });
  if (!restored) return NextResponse.json({ error: "File could not be restored" }, { status: 409 });

  return NextResponse.json({ file: restored });
}
