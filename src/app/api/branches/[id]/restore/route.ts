import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { workspaceId?: unknown } | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId || workspaceId.length > 128) return NextResponse.json({ error: "A valid workspaceId is required" }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "branches:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const branch = await prisma.branch.findFirst({ where: { id, workspaceId, archivedAt: { not: null } } });
  if (!branch) return NextResponse.json({ error: "Archived branch not found" }, { status: 404 });

  const restored = await prisma.branch.update({
    where: { id },
    data: { archivedAt: null, archivedById: null },
    select: { id: true, name: true, externalId: true, updatedAt: true },
  });
  await writeAuditLog({ workspaceId, actorUserId: session.user.id, action: "BRANCH_RESTORED", targetType: "BRANCH", targetId: id, request });
  return NextResponse.json({ branch: restored });
}
