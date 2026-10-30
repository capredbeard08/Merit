import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

const CONFIRMATION = "PERMANENTLY ERASE";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "Explicit permanent-erasure confirmation is required" }, { status: 400 });
  }

  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, pathname: true, status: true, deletedAt: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member || !can(member.role.toLowerCase() as Role, "files:erase")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!file.deletedAt || !["DELETED", "ERASURE_PENDING"].includes(file.status)) {
    return NextResponse.json({ error: "Only soft-deleted files can be permanently erased" }, { status: 409 });
  }

  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: file.status === "ERASURE_PENDING" ? "FILE_ERASURE_RETRY_STARTED" : "FILE_ERASURE_STARTED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { priorStatus: file.status },
    request,
  });

  // Keep the database tombstone if storage deletion fails so the operation can be retried.
  if (file.status !== "ERASURE_PENDING") await prisma.fileAsset.update({ where: { id: file.id }, data: { status: "ERASURE_PENDING" } });
  try {
    await del(file.pathname);
  } catch {
    return NextResponse.json({ error: "Storage erasure could not be confirmed; the file remains blocked for retry." }, { status: 503 });
  }

  await prisma.fileAsset.delete({ where: { id: file.id } });
  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: "FILE_PERMANENTLY_ERASED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { storageDeletionRequested: true },
    request,
  });
  return NextResponse.json({ erased: true });
}
