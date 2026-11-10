import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return NextResponse.json({ error: "Invalid workspaceId" }, { status: 400 });

  const membership = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!membership || !can(membership.role.toLowerCase() as Role, "security:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, groupedCounts] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, severity: true, targetId: true, metadata: true, createdAt: true, actorUserId: true },
    }),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  const counts = groupedCounts.reduce<Record<string, number>>((result, item) => {
    result[item.severity] = item._count._all;
    return result;
  }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });

  return NextResponse.json({ events, counts, windowDays: 30 });
}
