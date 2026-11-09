import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";
import { createEvidenceDownloadResponse } from "@/lib/file-evidence";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: {
      id: true, workspaceId: true, originalName: true, pathname: true,
      contentType: true, sizeBytes: true, status: true, deletedAt: true, priorStatus: true,
    },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member || !can(member.role.toLowerCase() as Role, "files:recover")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return createEvidenceDownloadResponse(
    file,
    async (pathname) => {
      const blob = await get(pathname, { access: "private" });
      if (!blob?.stream) return null;
      return { statusCode: blob.statusCode, stream: blob.stream };
    },
    () => writeAuditLog({
      workspaceId: file.workspaceId,
      actorUserId: session.user.id,
      action: "FILE_EVIDENCE_ACCESSED",
      targetType: "FILE_ASSET",
      targetId: file.id,
      metadata: {
        deletedAt: file.deletedAt?.toISOString() ?? "unknown",
        sizeBytes: file.sizeBytes,
        priorStatus: file.priorStatus ?? "unknown",
      },
      request,
    }),
  );
}
