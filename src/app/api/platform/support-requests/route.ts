export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformCapability } from "@/lib/platform-admin";
import { createSupportAccessRequestHandler } from "@/lib/support-access-request-api";

export async function GET(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:security:read");
  if (!authz.ok) return authz.response;

  const requests = await prisma.supportAccessRequest.findMany({
    where: { requestedByUserId: authz.session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, workspaceId: true, scope: true, status: true, reason: true,
      requestedDurationMinutes: true, requestExpiresAt: true, decidedAt: true,
      expiresAt: true, revokedAt: true, createdAt: true,
      workspace: { select: { name: true } },
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
    limit: 50,
  }, { headers: { "Cache-Control": "no-store" } });
}

const handleSupportAccessRequest = createSupportAccessRequestHandler({
  prisma,
  authorize: (request) => requirePlatformCapability(request, "platform:security:read", true),
});

export const POST = handleSupportAccessRequest;
