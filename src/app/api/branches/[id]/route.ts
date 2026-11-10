import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";
import { sanitizeSecurityMetadata } from "@/lib/security-warden";

const schema = z.object({
  workspaceId: z.string().min(1).max(128),
  name: z.string().trim().min(2).max(100).optional(),
  externalId: z.string().trim().max(100).nullable().optional(),
});

function auditRequestData(request: Request) {
  return {
    ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

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

  const existing = await prisma.branch.findFirst({ where: { id, workspaceId: parsed.data.workspaceId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  try {
    const changed = await withWorkspacePermission(
      parsed.data.workspaceId,
      session.user.id,
      "branches:manage",
      async (tx) => {
        const result = await tx.branch.updateMany({
          where: { id, workspaceId: parsed.data.workspaceId, archivedAt: null },
          data: {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.externalId !== undefined ? { externalId: parsed.data.externalId || null } : {}),
          },
        });
        if (result.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            actorUserId: session.user.id,
            action: "BRANCH_UPDATED",
            targetType: "BRANCH",
            targetId: id,
            metadata: sanitizeSecurityMetadata({
              changedName: parsed.data.name !== undefined,
              changedExternalId: parsed.data.externalId !== undefined,
            }),
            ...auditRequestData(request),
          },
        });
        return true;
      },
    );
    if (!changed) return NextResponse.json({ error: "Branch state changed; refresh and try again." }, { status: 409 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }

  const branch = await prisma.branch.findFirst({
    where: { id, workspaceId: parsed.data.workspaceId, archivedAt: null },
    select: { id: true, name: true, externalId: true, updatedAt: true },
  });
  if (!branch) return NextResponse.json({ error: "Branch is no longer active." }, { status: 409 });
  return NextResponse.json({ branch });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return NextResponse.json({ error: "A valid workspaceId is required" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.branch.findFirst({ where: { id, workspaceId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  try {
    const archived = await withWorkspacePermission(
      workspaceId,
      session.user.id,
      "branches:manage",
      async (tx) => {
        const result = await tx.branch.updateMany({
          where: { id, workspaceId, archivedAt: null },
          data: { archivedAt: new Date(), archivedById: session.user.id },
        });
        if (result.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorUserId: session.user.id,
            action: "BRANCH_ARCHIVED",
            targetType: "BRANCH",
            targetId: id,
            metadata: { dataPreserved: true },
            ...auditRequestData(request),
          },
        });
        return true;
      },
    );
    if (!archived) return NextResponse.json({ error: "Branch state changed; refresh and try again." }, { status: 409 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
  return new NextResponse(null, { status: 204 });
}
