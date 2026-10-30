import { del, get } from "@vercel/blob";
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
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "feedback:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (file.status === "QUARANTINED") return NextResponse.json({ error: "This file is quarantined and cannot be downloaded until reviewed." }, { status: 423 });
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
  const file = await prisma.fileAsset.findUnique({ where: { id }, select: { id: true, workspaceId: true, pathname: true, status: true } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "files:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await del(file.pathname);
  await prisma.fileAsset.delete({ where: { id: file.id } });
  await writeAuditLog({ workspaceId: file.workspaceId, actorUserId: session.user.id, action: "FILE_RECORD_DELETED", targetType: "FILE_ASSET", targetId: file.id, metadata: { priorStatus: file.status }, request });
  return new NextResponse(null, { status: 204 });
}
