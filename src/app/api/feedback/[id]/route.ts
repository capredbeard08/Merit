import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const schema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["CONTACTED","CLICKED","REPLIED","RESOLVED","OPTED_OUT"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback update" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "feedback:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const feedback = await prisma.feedback.findFirst({
    where: { id, workspaceId: parsed.data.workspaceId },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const now = new Date();
  const timestamps = {
    CONTACTED: { sentAt: now },
    CLICKED: { clickedAt: now },
    REPLIED: { repliedAt: now },
    RESOLVED: { resolvedAt: now },
    OPTED_OUT: {},
  } as const;

  const updated = await prisma.feedback.update({
    where: { id },
    data: { status: parsed.data.status, ...timestamps[parsed.data.status] },
    select: { id: true, status: true, sentAt: true, clickedAt: true, repliedAt: true, resolvedAt: true },
  });

  return NextResponse.json({ feedback: updated });
}
