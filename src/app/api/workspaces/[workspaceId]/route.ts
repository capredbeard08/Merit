import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";

const schema = z.object({ name: z.string().trim().min(2).max(120) });

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { workspaceId } = await context.params;
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "workspace:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace payload" }, { status: 400 });

  try {
    const workspace = await withWorkspacePermission(
      workspaceId,
      session.user.id,
      "workspace:manage",
      async (tx) => {
        const updated = await tx.workspace.update({
          where: { id: workspaceId },
          data: { name: parsed.data.name },
          select: { id: true, name: true, updatedAt: true },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorUserId: session.user.id,
            action: "WORKSPACE_UPDATED",
            targetType: "WORKSPACE",
            targetId: workspaceId,
            metadata: { changedName: true },
            ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        return updated;
      },
    );
    return NextResponse.json({ workspace });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
