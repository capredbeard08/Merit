import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";

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

  try {
    const changed = await withWorkspacePermission(
      workspaceId,
      session.user.id,
      "branches:manage",
      async (tx) => {
        const result = await tx.branch.updateMany({
          where: { id, workspaceId, archivedAt: { not: null } },
          data: { archivedAt: null, archivedById: null },
        });
        if (result.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorUserId: session.user.id,
            action: "BRANCH_RESTORED",
            targetType: "BRANCH",
            targetId: id,
            ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        return true;
      },
    );
    if (!changed) return NextResponse.json({ error: "Branch recovery state changed; refresh and try again." }, { status: 409 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }

  const restored = await prisma.branch.findFirst({
    where: { id, workspaceId, archivedAt: null },
    select: { id: true, name: true, externalId: true, updatedAt: true },
  });
  if (!restored) return NextResponse.json({ error: "Branch could not be restored." }, { status: 409 });
  return NextResponse.json({ branch: restored });
}
