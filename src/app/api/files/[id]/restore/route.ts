import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

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
  if (!member || !can(member.role.toLowerCase() as Role, "files:recover")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!file.deletedAt || file.status !== "DELETED") {
    return NextResponse.json({ error: "File is not in the recovery area" }, { status: 409 });
  }

  // Match the exact deletion generation read above. A stale restore request
  // must not restore a file that was deleted again after this request began.
  const claim = await prisma.fileAsset.updateMany({
    where: {
      id: file.id,
      workspaceId: file.workspaceId,
      status: "DELETED",
      deletedAt: file.deletedAt,
      priorStatus: file.priorStatus,
    },
    data: {
      status: file.priorStatus || "AVAILABLE",
      deletedAt: null,
      deletedById: null,
      priorStatus: null,
    },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: "File recovery state changed; refresh and try again." }, { status: 409 });
  }
  const restored = await prisma.fileAsset.findUnique({
    where: { id: file.id },
    select: { id: true, originalName: true, status: true, updatedAt: true },
  });
  if (!restored) return NextResponse.json({ error: "File could not be restored" }, { status: 409 });

  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: "FILE_RESTORED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { restoredStatus: restored.status },
    request,
  });
  return NextResponse.json({ file: restored });
}
