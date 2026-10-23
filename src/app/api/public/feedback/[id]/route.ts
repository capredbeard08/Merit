import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

const schema = z.object({
  token: z.string().min(10),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().min(2).max(5000),
  email: z.string().email().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyFeedbackToken(id, parsed.data?.token ?? "")) {
    return NextResponse.json({ error: "Invalid feedback request" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const rating = ["ONE", "TWO", "THREE", "FOUR", "FIVE"][parsed.data.rating - 1] as never;

  // Claim the feedback atomically before inserting a reply. Only one concurrent
  // request can transition an eligible feedback record to REPLIED.
  const accepted = await prisma.$transaction(async (tx) => {
    const claim = await tx.feedback.updateMany({
      where: { id, status: { in: ["PENDING", "CONTACTED", "CLICKED"] } },
      data: { repliedAt: new Date(), status: "REPLIED" },
    });
    if (claim.count !== 1) return false;

    await tx.feedbackReply.create({
      data: {
        workspaceId: feedback.workspaceId,
        feedbackId: feedback.id,
        rating,
        message: parsed.data.message,
        email: parsed.data.email,
      },
    });
    return true;
  });

  if (!accepted) {
    return NextResponse.json({ error: "Feedback has already been submitted or is no longer accepting replies" }, { status: 409 });
  }

  return NextResponse.json({ accepted: true });
}
