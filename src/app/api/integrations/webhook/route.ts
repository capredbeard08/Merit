import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const schema = z.object({
  workspaceId: z.string().min(1),
  label: z.string().trim().min(2).max(100).default("Service completion"),
  branchId: z.string().min(1).optional(),
});

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function POST(request: Request) {
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

  if (parsed.data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: parsed.data.branchId, workspaceId: parsed.data.workspaceId },
    });
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const secret = "merit_" + randomBytes(32).toString("base64url");
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      label: parsed.data.label,
      branchId: parsed.data.branchId ?? null,
      secretHash: hashSecret(secret),
    },
    select: { id: true, label: true, branchId: true, createdAt: true },
  });

  return NextResponse.json({
    endpoint,
    secret,
    warning: "Store this secret securely. MERIT will not show it again.",
  }, { status: 201 });
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

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


export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const endpointId = new URL(request.url).searchParams.get("id");
  if (!endpointId) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { id: true, workspaceId: true, revokedAt: true } });
  if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });
  const membership = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: endpoint.workspaceId, userId: session.user.id } } });
  if (!membership || !can(membership.role.toLowerCase() as Role, "integrations:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!endpoint.revokedAt) await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { revokedAt: new Date() } });
  return NextResponse.json({ revoked: true });
}
