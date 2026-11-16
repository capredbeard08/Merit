import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;

  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, deletedAt: true, priorStatus: true },
  });
  if (!file || !file.deletedAt) return NextResponse.json({ error: "Recoverable file not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Recoverable file not found" }, { status: 404 });
  if (!can(member.role.toLowerCase() as Role, "files:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const restored = await tx.fileAsset.updateMany({
        where: { id: file.id, workspaceId: file.workspaceId, deletedAt: { not: null } },
        data: {
          deletedAt: null,
          deletedById: null,
          priorStatus: null,
          status: file.priorStatus ?? "QUARANTINED",
          workspaceNameAtDeletion: null,
          deletedByNameAtDeletion: null,
        },
      });
      if (restored.count !== 1) throw new Error("FILE_STATE_CHANGED");

      await tx.auditLog.create({
        data: {
          workspaceId: file.workspaceId,
          actorUserId: session.user.id,
          action: "FILE_RESTORED",
          targetType: "FileAsset",
          targetId: file.id,
          metadata: { restoredFromRecoverableDeletion: true },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FILE_STATE_CHANGED") {
      return NextResponse.json({ error: "File state changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ restored: true });
}
