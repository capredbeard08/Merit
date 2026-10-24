import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

const noteSchema = z.object({
  workspaceId: z.string().min(1),
  note: z.string().trim().min(1).max(2000),
});

async function getAuthorizedMembership(request: Request, workspaceId: string, permission: "feedback:read" | "feedback:write") {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, permission)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, membership };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const access = await getAuthorizedMembership(request, workspaceId, "feedback:read");
  if (!("session" in access)) return access.response;

  const feedback = await prisma.feedback.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const records = await prisma.auditLog.findMany({
    where: { workspaceId, targetType: "FeedbackNote", targetId: id, action: "FEEDBACK_NOTE_CREATED" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, actorUserId: true, metadata: true, createdAt: true },
  });
  const authorIds = [...new Set(records.map((record) => record.actorUserId).filter((value): value is string => Boolean(value)))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const notes = records.map((record) => {
    const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : {};
    const author = record.actorUserId ? authorById.get(record.actorUserId) : undefined;
    return {
      id: record.id,
      note: typeof metadata.note === "string" ? metadata.note : "",
      createdAt: record.createdAt.toISOString(),
      author: author?.name || author?.email || "Former team member",
    };
  }).filter((record) => record.note);
  return NextResponse.json({ notes });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a note of up to 2,000 characters." }, { status: 400 });
  const access = await getAuthorizedMembership(request, parsed.data.workspaceId, "feedback:write");
  if (access.response) return access.response;

  const feedback = await prisma.feedback.findFirst({
    where: { id, workspaceId: parsed.data.workspaceId },
    select: { id: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const record = await prisma.auditLog.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      actorUserId: access.session.user.id,
      action: "FEEDBACK_NOTE_CREATED",
      targetType: "FeedbackNote",
      targetId: id,
      metadata: { note: parsed.data.note },
    },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({
    note: {
      id: record.id,
      note: parsed.data.note,
      createdAt: record.createdAt.toISOString(),
      author: access.session.user.name || access.session.user.email,
    },
  }, { status: 201 });
}
