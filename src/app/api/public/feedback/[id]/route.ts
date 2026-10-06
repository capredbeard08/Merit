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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyFeedbackToken(id, parsed.data?.token ?? "")) {
    return NextResponse.json({ error: "Invalid feedback request" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, customerId: true, status: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const rating = ["ONE", "TWO", "THREE", "FOUR", "FIVE"][parsed.data.rating - 1] as never;
  await prisma.$transaction([
    prisma.feedbackReply.create({
      data: {
        workspaceId: feedback.workspaceId,
        feedbackId: feedback.id,
        rating,
        message: parsed.data.message,
        email: parsed.data.email,
      },
    }),
    prisma.feedback.update({
      where: { id: feedback.id },
      data: { repliedAt: new Date(), status: "REPLIED" },
    }),
  ]);

  return NextResponse.json({ accepted: true });
}
