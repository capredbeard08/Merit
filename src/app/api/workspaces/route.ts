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

  const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
  const membership = requestedWorkspaceId
    ? await prisma.member.findUnique({
        where: { workspaceId_userId: { workspaceId: requestedWorkspaceId, userId: session.user.id } },
        include: { workspace: { select: { id: true, name: true } } },
      })
    : await prisma.member.findFirst({
        where: { userId: session.user.id },
        include: { workspace: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      });

  if (requestedWorkspaceId && !membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

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

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The endpoint intentionally provisions only one initial workspace per
      // user. Lock the user row so concurrent first-time requests cannot both
      // pass the membership check and create duplicate workspaces.
      const lockedUser = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "id" = ${session.user.id} FOR UPDATE
      `;
      if (lockedUser.length !== 1) throw new Error("WORKSPACE_OWNER_NOT_FOUND");

      const existingMembership = await tx.member.findFirst({
        where: { userId: session.user.id },
        include: { workspace: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (existingMembership) {
        return {
          created: false,
          workspace: {
            id: existingMembership.workspace.id,
            name: existingMembership.workspace.name,
            role: existingMembership.role,
          },
        };
      }

      const workspace = await tx.workspace.create({
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

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: session.user.id,
          action: "WORKSPACE_CREATED",
          targetType: "WORKSPACE",
          targetId: workspace.id,
          metadata: { initialOwnerProvisioning: true },
          ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });

      return {
        created: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          role: workspace.members[0]?.role ?? "OWNER",
        },
      };
    });

    return NextResponse.json(
      { workspace: result.workspace },
      { status: result.created ? 201 : 200 },
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
