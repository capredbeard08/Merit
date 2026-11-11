import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

function auditRequestData(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
      ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const file = await prisma.fileAsset.findFirst({ where: { id, deletedAt: null } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  // A missing membership must not reveal that a file exists in another workspace.
  if (!member) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!can(member.role.toLowerCase() as Role, "feedback:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (file.status === "QUARANTINED") {
    return NextResponse.json({ error: "This file is quarantined and cannot be downloaded until reviewed." }, { status: 423 });
  }
  if (file.status === "DELETED") return NextResponse.json({ error: "File not found" }, { status: 404 });

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
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: {
      id: true, workspaceId: true, status: true, deletedAt: true, legalHoldAt: true,
      workspace: { select: { name: true } },
    },
  });
  if (!file || file.deletedAt) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!can(member.role.toLowerCase() as Role, "files:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (file.legalHoldAt) {
    return NextResponse.json({ error: "This file is under legal hold and cannot be deleted." }, { status: 423 });
  }

  const deletedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.fileAsset.updateMany({
        where: { id: file.id, workspaceId: file.workspaceId, deletedAt: null, legalHoldAt: null },
        data: {
          deletedAt,
          deletedById: session.user.id,
          priorStatus: file.status,
          status: "DELETED",
          workspaceNameAtDeletion: file.workspace.name,
          deletedByNameAtDeletion: session.user.name ?? null,
        },
      });
      if (changed.count !== 1) throw new Error("FILE_STATE_CHANGED");

      await tx.auditLog.create({
        data: {
          workspaceId: file.workspaceId,
          actorUserId: session.user.id,
          action: "FILE_SOFT_DELETED",
          targetType: "FileAsset",
          targetId: file.id,
          metadata: { priorStatus: file.status, retention: "RECOVERABLE" },
          ...auditRequestData(request),
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FILE_STATE_CHANGED") {
      return NextResponse.json({ error: "File state changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }

  // The Blob and database row are deliberately retained for recovery and evidence.
  return new NextResponse(null, { status: 204 });
}
