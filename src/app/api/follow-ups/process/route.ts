import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, feedbackEmailHtml } from "@/lib/email";
import { createFeedbackToken } from "@/lib/feedback-token";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-merit-cron-secret");
  const authorization = request.headers.get("authorization");
  const valid = !!secret && (headerSecret === secret || authorization === "Bearer " + secret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const staleClaim = new Date(now.getTime() - 10 * 60 * 1000);
  // Recover jobs abandoned by a crashed worker. Provider idempotency protects retries
  // if a provider accepted an email immediately before the worker stopped.
  await prisma.followUp.updateMany({
    where: { status: "PROCESSING", processingAt: { lt: staleClaim } },
    data: { status: "QUEUED", processingAt: null },
  });

  const due = await prisma.followUp.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: 25,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of due) {
    const claim = await prisma.followUp.updateMany({
      where: { id: candidate.id, status: "QUEUED" },
      data: { status: "PROCESSING", processingAt: new Date() },
    });
    if (claim.count !== 1) { skipped++; continue; }

    const item = await prisma.followUp.findUnique({
      where: { id: candidate.id },
      include: {
        workspace: true,
        feedback: { include: { customer: true, branch: true } },
      },
    });
    if (!item) { skipped++; continue; }

    const customer = item.feedback.customer;
    if (!customer.email || customer.optedOutAt || item.feedback.status === "OPTED_OUT") {
      await prisma.followUp.update({ where: { id: item.id }, data: { status: "CANCELLED", processingAt: null } });
      continue;
    }

    // Opt-out can arrive after the initial job read. Re-read immediately
    // before dispatch and require this worker still owns the PROCESSING state.
    const dispatchState = await prisma.followUp.findUnique({
      where: { id: item.id },
      include: { feedback: { include: { customer: true } } },
    });
    if (
      !dispatchState ||
      dispatchState.status !== "PROCESSING" ||
      dispatchState.feedback.customer.optedOutAt ||
      dispatchState.feedback.status === "OPTED_OUT"
    ) {
      await prisma.followUp.updateMany({
        where: { id: item.id, status: "PROCESSING" },
        data: { status: "CANCELLED", processingAt: null },
      });
      skipped++;
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

      const finalized = await prisma.$transaction(async (tx) => {
        const owned = await tx.followUp.updateMany({
          where: { id: item.id, status: "PROCESSING" },
          data: { status: "SENT", sentAt: new Date(), providerId: result.id ?? null, processingAt: null, error: null },
        });
        if (owned.count === 1) {
          await tx.feedback.update({
            where: { id: item.feedbackId },
            data: { sentAt: new Date(), status: "CONTACTED" },
          });
        }
        return owned.count;
      });
      if (finalized === 1) sent++;
      else skipped++;
    } catch (error) {
      const markedFailed = await prisma.followUp.updateMany({
        where: { id: item.id, status: "PROCESSING" },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          processingAt: null,
          error: error instanceof Error ? error.message.slice(0, 500) : "Unknown email error",
        },
      });
      if (markedFailed.count === 1) failed++;
      else skipped++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed, skipped });
}
