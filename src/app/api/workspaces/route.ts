import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    workspace: membership
      ? { id: membership.workspace.id, name: membership.workspace.name, role: membership.role }
      : null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workspace name" }, { status: 400 });
  }

  const existingMembership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (existingMembership) {
    return NextResponse.json({
      workspace: {
        id: existingMembership.workspace.id,
        name: existingMembership.workspace.name,
        role: existingMembership.role,
      },
    });
  }

  try {
    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        members: {
          create: {
            userId: session.user.id,
            email: session.user.email.toLowerCase(),
            role: "OWNER",
          },
        },
      },
      select: {
        id: true,
        name: true,
        members: { select: { role: true } },
      },
    });

    return NextResponse.json(
      {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          role: workspace.members[0]?.role ?? "OWNER",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "WORKSPACE_CREATE_FAILED";
    console.error("[MERIT workspace] create failed", { code, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(
      { error: "Workspace setup failed. Please try again. If this continues, contact support." },
      { status: 500 },
    );
  }
}
