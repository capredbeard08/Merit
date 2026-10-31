import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { can, type Role } from "@/lib/domain";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!can(membership.role.toLowerCase() as Role, "feedback:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const replies = await prisma.feedbackReply.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      rating: true,
      message: true,
      createdAt: true,
      feedback: {
        select: {
          id: true,
          customer: { select: { name: true, email: true, optedOutAt: true } },
          branch: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json({ replies });
}
