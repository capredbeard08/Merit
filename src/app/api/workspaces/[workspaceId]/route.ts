import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

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

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, updatedAt: true },
  });

  return NextResponse.json({ workspace });
}
