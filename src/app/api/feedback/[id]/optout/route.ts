import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

const schema = z.object({ token: z.string().min(10).max(512) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid opt-out link" }, { status: 400 });

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, customerId: true, sentAt: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback request not found" }, { status: 404 });
  if (!verifyFeedbackToken(id, parsed.data.token, feedback.sentAt)) {
    return NextResponse.json({ error: "Invalid or expired opt-out link" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: feedback.customerId, workspaceId: feedback.workspaceId },
      data: { optedOutAt: new Date() },
    });
    await tx.feedback.update({
      where: { id, workspaceId: feedback.workspaceId },
      data: { status: "OPTED_OUT" },
    });
    await tx.followUp.updateMany({
      where: { workspaceId: feedback.workspaceId, status: { in: ["QUEUED", "PROCESSING"] }, feedback: { customerId: feedback.customerId } },
      data: { status: "CANCELLED", processingAt: null },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: feedback.workspaceId,
        actorUserId: null,
        action: "CUSTOMER_OPTED_OUT",
        targetType: "CUSTOMER",
        targetId: feedback.customerId,
        metadata: { source: "public_feedback_link" },
      },
    });
  });

  return NextResponse.json({ optedOut: true });
}
