import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token || !verifyFeedbackToken(id, token)) {
    return NextResponse.json({ error: "Invalid opt-out link" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, customerId: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback request not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: feedback.customerId },
      data: { optedOutAt: new Date() },
    }),
    prisma.feedback.update({
      where: { id },
      data: { status: "OPTED_OUT" },
    }),
    prisma.followUp.updateMany({
      where: { feedbackId: id, status: "QUEUED" },
      data: { status: "CANCELLED" },
    }),
  ]);

  return NextResponse.redirect(new URL("/feedback/" + id + "/opted-out", request.url));
}
