import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

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
