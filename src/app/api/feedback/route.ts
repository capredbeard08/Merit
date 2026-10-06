import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const querySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["PENDING","CONTACTED","CLICKED","REPLIED","RESOLVED","OPTED_OUT"]).optional(),
});

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    workspaceId: params.get("workspaceId"),
    status: params.get("status") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      },
    },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "feedback:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const feedback = await prisma.feedback.findMany({
    where: {
      workspaceId: parsed.data.workspaceId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      sentAt: true,
      clickedAt: true,
      repliedAt: true,
      branch: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ feedback });
}
