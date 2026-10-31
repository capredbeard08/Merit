import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file || file.deletedAt || file.status === "DELETED") return NextResponse.json({ error: "File not found" }, { status: 404 });
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "feedback:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (file.status === "QUARANTINED" || file.status === "ERASURE_PENDING") return NextResponse.json({ error: "This file is unavailable until its safety or deletion workflow is complete." }, { status: 423 });
  const blob = await get(file.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "Stored file not found" }, { status: 404 });
  return new Response(blob.stream, { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.originalName),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
  }});
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({ where: { id }, select: { id: true, workspaceId: true, status: true, deletedAt: true } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "files:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (file.deletedAt || file.status === "DELETED") return new NextResponse(null, { status: 204 });

  // Compare-and-set prevents a stale delete request from overwriting a
  // concurrent restore, quarantine, or permanent-erasure transition.
  const claim = await prisma.fileAsset.updateMany({
    where: { id: file.id, workspaceId: file.workspaceId, status: file.status, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.user.id, priorStatus: file.status, status: "DELETED" },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: "File state changed; refresh and try again." }, { status: 409 });
  }

  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: "FILE_SOFT_DELETED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { priorStatus: file.status, recoveryAvailable: true },
    request,
  });
  return new NextResponse(null, { status: 204 });
}
