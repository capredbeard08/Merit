import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const schema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  externalId: z.string().trim().max(100).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid branch payload" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.branch.findFirst({ where: { id, workspaceId: parsed.data.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const branch = await prisma.branch.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.externalId !== undefined ? { externalId: parsed.data.externalId || null } : {}),
    },
    select: { id: true, name: true, externalId: true, updatedAt: true },
  });

  return NextResponse.json({ branch });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.branch.findFirst({ where: { id, workspaceId } });
  if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  await prisma.branch.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
