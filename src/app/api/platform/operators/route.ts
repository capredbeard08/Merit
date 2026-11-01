export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformCapability, platformRequestContext } from "@/lib/platform-admin";

const grantSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["PLATFORM_ADMIN", "ENGINEER"]),
}).strict();

const revokeSchema = z.object({
  userId: z.string().min(1).max(128),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:users:read");
  if (!authz.ok) return authz.response;

  const operators = await prisma.platformAccess.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      userId: true,
      role: true,
      grantedByUserId: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, email: true, emailVerified: true } },
    },
  });

  return NextResponse.json({
    operators: operators.map((operator) => ({
      id: operator.id,
      userId: operator.userId,
      name: operator.user.name,
      email: operator.user.email,
      emailVerified: operator.user.emailVerified,
      role: operator.role,
      grantedByUserId: operator.grantedByUserId,
      revokedAt: operator.revokedAt,
      createdAt: operator.createdAt,
      updatedAt: operator.updatedAt,
    })),
    limit: 100,
  });
}

export async function POST(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:access:grant", true, { requireRecentAuthentication: true, rateLimit: { action: "operator-grant", limit: 10, windowMs: 15 * 60 * 1000 } });
  if (!authz.ok) return authz.response;

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2048) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a valid registered email and an allowed platform role" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const context = platformRequestContext(request);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, emailVerified: true },
      });
      if (!target) return { kind: "not_found" as const };
      if (!target.emailVerified) return { kind: "unverified" as const };

      const existing = await tx.platformAccess.findUnique({
        where: { userId: target.id },
        select: { id: true, role: true, revokedAt: true },
      });
      if (existing && existing.revokedAt === null) return { kind: "already_active" as const };
      if (existing?.role === "FOUNDER_SUPER_ADMIN") return { kind: "founder_reserved" as const };

      const access = existing
        ? await tx.platformAccess.update({
            where: { id: existing.id },
            data: {
              role: parsed.data.role,
              grantedByUserId: authz.session.user.id,
              revokedAt: null,
            },
            select: { id: true, userId: true, role: true, createdAt: true },
          })
        : await tx.platformAccess.create({
            data: {
              userId: target.id,
              role: parsed.data.role,
              grantedByUserId: authz.session.user.id,
            },
            select: { id: true, userId: true, role: true, createdAt: true },
          });

      await tx.securityEvent.create({
        data: {
          actorUserId: authz.session.user.id,
          type: existing ? "PLATFORM_ACCESS_REINSTATED" : "PLATFORM_ACCESS_GRANTED",
          severity: "HIGH",
          targetId: target.id,
          metadata: {
            role: access.role,
            ...(existing ? { previousRole: existing.role } : {}),
            reason: existing ? "founder_reinstated_revoked_operator" : "founder_granted_operator_access",
          },
          ...context,
        },
      });
      return { kind: "granted" as const, access };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") return NextResponse.json({ error: "No registered account matches that email" }, { status: 404 });
    if (result.kind === "unverified") return NextResponse.json({ error: "That account must verify its email before receiving platform access" }, { status: 409 });
    if (result.kind === "already_active") return NextResponse.json({ error: "That account already has active platform access" }, { status: 409 });
    if (result.kind === "founder_reserved") return NextResponse.json({ error: "Founder access cannot be changed through operator management" }, { status: 409 });

    return NextResponse.json({ success: true, operator: result.access }, { status: 201 });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "PLATFORM_ACCESS_GRANT_FAILED";
    if (code === "P2002" || code === "P2034") {
      return NextResponse.json({ error: "The account's platform access changed concurrently. Refresh and try again." }, { status: 409 });
    }
    console.error("[MERIT platform access] grant failed", { code });
    return NextResponse.json({ error: "Unable to grant platform access" }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:access:revoke", true, { requireRecentAuthentication: true, rateLimit: { action: "operator-revoke", limit: 10, windowMs: 15 * 60 * 1000 } });
  if (!authz.ok) return authz.response;

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid operator identifier" }, { status: 400 });

  const targetUserId = parsed.data.userId;
  if (targetUserId === authz.session.user.id) {
    return NextResponse.json({ error: "You cannot revoke your own active platform session" }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.platformAccess.findUnique({
        where: { userId: targetUserId },
        select: { id: true, role: true, revokedAt: true, user: { select: { email: true } } },
      });
      if (!target) return { kind: "not_found" as const };
      if (target.role === "FOUNDER_SUPER_ADMIN") return { kind: "founder_reserved" as const };
      if (target.revokedAt) return { kind: "already_revoked" as const };

      const revokedAt = new Date();
      await tx.platformAccess.update({
        where: { id: target.id },
        data: { revokedAt },
      });
      await tx.securityEvent.create({
        data: {
          actorUserId: authz.session.user.id,
          type: "PLATFORM_ACCESS_REVOKED",
          severity: "HIGH",
          targetId: targetUserId,
          metadata: {
            previousRole: target.role,
            reason: "founder_revoked_operator_access",
          },
          ...platformRequestContext(request),
        },
      });
      return { kind: "revoked" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") return NextResponse.json({ error: "Platform operator not found" }, { status: 404 });
    if (result.kind === "founder_reserved") return NextResponse.json({ error: "Founder access cannot be revoked through operator management" }, { status: 409 });
    if (result.kind === "already_revoked") return NextResponse.json({ error: "That operator is already revoked" }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "PLATFORM_ACCESS_REVOKE_FAILED";
    if (code === "P2034") return NextResponse.json({ error: "The operator's access changed concurrently. Refresh and try again." }, { status: 409 });
    console.error("[MERIT platform access] revoke failed", { code });
    return NextResponse.json({ error: "Unable to revoke platform access" }, { status: 500 });
  }
}
