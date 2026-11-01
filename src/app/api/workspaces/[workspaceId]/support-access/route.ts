export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { evaluateSupportAccessDecision } from "@/lib/support-access-decision";
import { isSameOriginRequest } from "@/lib/founder-bootstrap";

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

import { createSupportAccessDecisionHandler } from "@/lib/support-access-api";

const handleSupportAccessDecision = createSupportAccessDecisionHandler({
  prisma,
  getSession: (headers) => auth.api.getSession({ headers }),
});

export const PATCH = handleSupportAccessDecision;
