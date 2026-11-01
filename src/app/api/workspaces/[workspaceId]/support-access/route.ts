export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { canAccessPlatform } from "@/lib/platform-access";

const decisionSchema = z.object({
  requestId: z.string().min(1).max(128),
  decision: z.enum(["APPROVE", "DENY", "REVOKE"]),
}).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { workspaceId } = await context.params;
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    select: { role: true },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "members:manage")) {
    return NextResponse.json({ error: "Only workspace owners and administrators can review support access requests" }, { status: 403 });
  }

  const requests = await prisma.supportAccessRequest.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, requestedByUserId: true, scope: true, status: true, reason: true,
      requestedDurationMinutes: true, requestExpiresAt: true, decidedAt: true,
      expiresAt: true, revokedAt: true, createdAt: true,
      requestedBy: { select: { name: true, email: true } },
      decidedBy: { select: { name: true, email: true } },
    },
  });
  const now = new Date();
  return NextResponse.json({
    requests: requests.map((item) => ({
      ...item,
      effectiveStatus: (item.status === "PENDING" && item.requestExpiresAt <= now)
        || (item.status === "APPROVED" && (!item.expiresAt || item.expiresAt <= now))
        ? "EXPIRED" : item.status,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { workspaceId } = await context.params;

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid support access decision" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.member.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
        select: { role: true },
      });
      if (!membership || !can(membership.role.toLowerCase() as Role, "members:manage")) {
        return { kind: "forbidden" as const };
      }

      const supportRequest = await tx.supportAccessRequest.findFirst({
        where: { id: parsed.data.requestId, workspaceId },
        select: {
          id: true, requestedByUserId: true, scope: true, status: true,
          requestedDurationMinutes: true, requestExpiresAt: true, expiresAt: true,
        },
      });
      if (!supportRequest) return { kind: "not_found" as const };
      if (supportRequest.requestedByUserId === session.user.id) return { kind: "self_approval" as const };

      const now = new Date();
      if (parsed.data.decision === "APPROVE" || parsed.data.decision === "DENY") {
        if (supportRequest.status !== "PENDING" || supportRequest.requestExpiresAt <= now) {
          return { kind: "not_pending" as const };
        }
      } else if (supportRequest.status !== "APPROVED" || !supportRequest.expiresAt || supportRequest.expiresAt <= now) {
        return { kind: "not_active" as const };
      }

      if (parsed.data.decision === "APPROVE") {
        const operatorAccess = await tx.platformAccess.findUnique({
          where: { userId: supportRequest.requestedByUserId },
          select: { role: true, revokedAt: true },
        });
        if (!canAccessPlatform(operatorAccess, "platform:security:read")) {
          return { kind: "operator_inactive" as const };
        }
      }

      const nextStatus = parsed.data.decision === "APPROVE"
        ? "APPROVED"
        : parsed.data.decision === "DENY" ? "DENIED" : "REVOKED";
      const updated = await tx.supportAccessRequest.update({
        where: { id: supportRequest.id },
        data: parsed.data.decision === "APPROVE"
          ? {
              status: "APPROVED",
              decidedByUserId: session.user.id,
              decidedAt: now,
              expiresAt: new Date(now.getTime() + supportRequest.requestedDurationMinutes * 60_000),
            }
          : parsed.data.decision === "DENY"
            ? { status: "DENIED", decidedAt: now, approvedByUserId: session.user.id }
            : { status: "REVOKED", revokedAt: now, revokedByUserId: session.user.id },
        select: { id: true, status: true, scope: true, expiresAt: true },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: session.user.id,
          action: `SUPPORT_ACCESS_${nextStatus}`,
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: supportRequest.id,
          metadata: {
            scope: supportRequest.scope,
            supportAccessRequestId: supportRequest.id,
            ...(parsed.data.decision === "APPROVE" ? { durationMinutes: String(supportRequest.requestedDurationMinutes) } : {}),
          },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });

      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: session.user.id,
          type: `SUPPORT_ACCESS_${nextStatus}`,
          severity: "HIGH",
          targetId: workspaceId,
          metadata: {
            supportAccessRequestId: supportRequest.id,
            scope: supportRequest.scope,
            reason: `business_${parsed.data.decision.toLowerCase()}_support_access`,
          },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
      return { kind: "updated" as const, request: updated, status: nextStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "forbidden") return NextResponse.json({ error: "Only workspace owners and administrators can decide support access requests" }, { status: 403 });
    if (result.kind === "not_found") return NextResponse.json({ error: "Support access request not found" }, { status: 404 });
    if (result.kind === "self_approval") return NextResponse.json({ error: "The requesting operator cannot approve their own request" }, { status: 409 });
    if (result.kind === "not_pending") return NextResponse.json({ error: "This request is no longer awaiting a decision" }, { status: 409 });
    if (result.kind === "not_active") return NextResponse.json({ error: "Only an active approved grant can be revoked" }, { status: 409 });
    if (result.kind === "operator_inactive") return NextResponse.json({ error: "The requesting operator no longer has active platform access" }, { status: 409 });
    return NextResponse.json({ success: true, request: result.request });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "SUPPORT_ACCESS_DECISION_FAILED";
    if (code === "P2034") return NextResponse.json({ error: "The request changed concurrently. Refresh and try again." }, { status: 409 });
    console.error("[MERIT support access] decision failed", { code });
    return NextResponse.json({ error: "Unable to update support access request" }, { status: 500 });
  }
}
