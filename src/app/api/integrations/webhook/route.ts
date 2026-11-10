import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";

const schema = z.object({
  workspaceId: z.string().min(1).max(128),
  label: z.string().trim().min(2).max(100).default("Service completion"),
  branchId: z.string().min(1).max(128).optional(),
});

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function auditRequestData(request: Request) {
  return {
    ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid integration payload" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "integrations:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const secret = "merit_" + randomBytes(32).toString("base64url");
  try {
    const endpoint = await withWorkspacePermission(
      parsed.data.workspaceId,
      session.user.id,
      "integrations:manage",
      async (tx) => {
        if (parsed.data.branchId) {
          const activeBranch = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Branch"
            WHERE "id" = ${parsed.data.branchId}
              AND "workspaceId" = ${parsed.data.workspaceId}
              AND "archivedAt" IS NULL
            FOR SHARE
          `;
          if (activeBranch.length !== 1) throw new Error("BRANCH_NOT_ACTIVE");
        }

        const created = await tx.webhookEndpoint.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            label: parsed.data.label,
            branchId: parsed.data.branchId ?? null,
            secretHash: hashSecret(secret),
          },
          select: { id: true, label: true, branchId: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            actorUserId: session.user.id,
            action: "WEBHOOK_CREATED",
            targetType: "WebhookEndpoint",
            targetId: created.id,
            metadata: { label: created.label, branchId: created.branchId },
            ...auditRequestData(request),
          },
        });
        return created;
      },
    );

    return NextResponse.json({
      endpoint,
      secret,
      warning: "Store this secret securely. MERIT will not show it again.",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "BRANCH_NOT_ACTIVE") {
      return NextResponse.json({ error: "Branch not found or no longer active" }, { status: 404 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "integrations:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, branchId: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  return NextResponse.json({ endpoints });
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const endpointId = new URL(request.url).searchParams.get("id");
  if (!endpointId || endpointId.length > 128) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, workspaceId: true, revokedAt: true },
  });
  if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: endpoint.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "integrations:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!endpoint.revokedAt) {
    try {
      await withWorkspacePermission(
        endpoint.workspaceId,
        session.user.id,
        "integrations:manage",
        async (tx) => {
          const changed = await tx.webhookEndpoint.updateMany({
            where: { id: endpoint.id, workspaceId: endpoint.workspaceId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          if (changed.count !== 1) return;
          await tx.auditLog.create({
            data: {
              workspaceId: endpoint.workspaceId,
              actorUserId: session.user.id,
              action: "WEBHOOK_REVOKED",
              targetType: "WebhookEndpoint",
              targetId: endpoint.id,
              ...auditRequestData(request),
            },
          });
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      throw error;
    }
  }

  return NextResponse.json({ revoked: true });
}
