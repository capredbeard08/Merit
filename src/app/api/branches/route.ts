import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const schema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  externalId: z.string().trim().max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branches = await prisma.branch.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, externalId: true, createdAt: true },
  });

  return NextResponse.json({ branches });
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid branch payload" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      },
    },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branch = await prisma.branch.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      externalId: parsed.data.externalId || null,
    },
    select: { id: true, name: true, externalId: true, createdAt: true },
  });

  return NextResponse.json({ branch }, { status: 201 });
}
