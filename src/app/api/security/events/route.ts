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
  if (!membership || !can(membership.role.toLowerCase() as Role, "workspace:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await prisma.auditLog.findMany({
    where: { workspaceId, action: { startsWith: "SECURITY:" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, action: true, targetId: true, metadata: true, createdAt: true, actorUserId: true },
  });
  const counts = events.reduce<Record<string, number>>((result, event) => {
    const severity = typeof event.metadata === "object" && event.metadata && "severity" in event.metadata ? String(event.metadata.severity) : "UNKNOWN";
    result[severity] = (result[severity] ?? 0) + 1;
    return result;
  }, {});
  return NextResponse.json({ events, counts });
}
