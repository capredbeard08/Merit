import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, feedbackEmailHtml } from "@/lib/email";
import { createFeedbackToken } from "@/lib/feedback-token";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-merit-cron-secret");
  const authorization = request.headers.get("authorization");
  const valid = !!secret && (headerSecret === secret || authorization === "Bearer " + secret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const due = await prisma.followUp.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 25,
    include: {
      workspace: true,
      feedback: { include: { customer: true, branch: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    const customer = item.feedback.customer;
    if (!customer.email || customer.optedOutAt || item.feedback.status === "OPTED_OUT") {
      await prisma.followUp.update({ where: { id: item.id }, data: { status: "CANCELLED" } });
      continue;
    }

    const token = createFeedbackToken(item.feedback.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const feedbackUrl = appUrl + "/api/feedback/" + item.feedback.id + "/click?t=" + token;
    const optOutUrl = appUrl + "/feedback/" + item.feedback.id + "/optout?t=" + token;

    try {
      const result = await sendEmail({
        to: customer.email,
        subject: "We'd value your honest feedback",
        html: feedbackEmailHtml({
          customerName: customer.name,
          businessName: item.workspace.name,
          branchName: item.feedback.branch.name,
          feedbackUrl,
          optOutUrl,
        }),
        idempotencyKey: "merit-followup-" + item.id,
      });

      await prisma.$transaction([
        prisma.followUp.update({
          where: { id: item.id },
          data: { status: "SENT", sentAt: new Date(), providerId: result.id },
        }),
        prisma.feedback.update({
          where: { id: item.feedbackId },
          data: { sentAt: new Date(), status: "CONTACTED" },
        }),
      ]);
      sent++;
    } catch (error) {
      await prisma.followUp.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          error: error instanceof Error ? error.message.slice(0, 500) : "Unknown email error",
        },
      });
      failed++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed });
}
