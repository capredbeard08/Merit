import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { withWorkspacePermission } from "@/lib/workspace-access";

const noteSchema = z.object({
  workspaceId: z.string().min(1),
  note: z.string().trim().min(1).max(2000),
});

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  throw error;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    const notes = await withWorkspacePermission(workspaceId, session.user.id, "feedback:read", async (tx) => {
      const feedback = await tx.feedback.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (!feedback) return null;

      const records = await tx.feedbackNote.findMany({
        where: { workspaceId, feedbackId: id },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      });
      return records.map((record) => ({
        id: record.id,
        note: record.content,
        createdAt: record.createdAt.toISOString(),
        author: record.author?.name || "Former team member",
      }));
    });

    if (!notes) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    return NextResponse.json({ notes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a note of up to 2,000 characters." }, { status: 400 });
  }

  try {
    const note = await withWorkspacePermission(
      parsed.data.workspaceId,
      session.user.id,
      "feedback:write",
      async (tx) => {
        const feedback = await tx.feedback.findFirst({
          where: { id, workspaceId: parsed.data.workspaceId },
          select: { id: true },
        });
        if (!feedback) return null;

        const record = await tx.feedbackNote.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            feedbackId: id,
            authorUserId: session.user.id,
            content: parsed.data.note,
          },
          select: { id: true, content: true, createdAt: true, author: { select: { name: true } } },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            actorUserId: session.user.id,
            action: "FEEDBACK_NOTE_CREATED",
            targetType: "FeedbackNote",
            targetId: record.id,
            metadata: { contentLength: record.content.length },
          },
        });
        return record;
      },
    );

    if (!note) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    return NextResponse.json({
      note: {
        id: note.id,
        note: note.content,
        createdAt: note.createdAt.toISOString(),
        author: note.author?.name || session.user.name || session.user.email,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
