import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, feedbackEmailHtml } from "@/lib/email";
import { createFeedbackToken, FEEDBACK_TOKEN_TTL_SECONDS } from "@/lib/feedback-token";
import { canDispatchFollowUp, FOLLOW_UP_IDEMPOTENCY_RETRY_WINDOW_MS } from "@/lib/security";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-merit-cron-secret");
  const authorization = request.headers.get("authorization");
  const valid = !!secret && (headerSecret === secret || authorization === "Bearer " + secret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const staleClaim = new Date(now.getTime() - 10 * 60 * 1000);
  // Resend retains idempotency keys for 24 hours. Leave a one-hour margin:
  // firstAttemptAt is recorded before the first provider request, so older
  // ambiguous attempts must be reconciled instead of blindly resent.
  const safeRetryCutoff = new Date(now.getTime() - FOLLOW_UP_IDEMPOTENCY_RETRY_WINDOW_MS);
  await prisma.followUp.updateMany({
    where: { status: { in: ["PROCESSING", "QUEUED"] }, firstAttemptAt: { lt: safeRetryCutoff } },
    data: {
      status: "FAILED",
      failedAt: now,
      processingAt: null,
      error: "Provider outcome is unknown and the idempotency window has elapsed; manual reconciliation is required.",
    },
  });
  await prisma.followUp.updateMany({
    where: {
      status: "PROCESSING",
      processingAt: { lt: staleClaim },
      firstAttemptAt: { gte: safeRetryCutoff },
    },
    data: { status: "QUEUED", processingAt: null },
  });

  const due = await prisma.followUp.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: 25,
    select: { id: true, workspaceId: true, firstAttemptAt: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of due) {
    const claimStartedAt = new Date();
    const claim = await prisma.followUp.updateMany({
      where: { id: candidate.id, workspaceId: candidate.workspaceId, status: "QUEUED" },
      data: {
        status: "PROCESSING",
        processingAt: claimStartedAt,
        firstAttemptAt: candidate.firstAttemptAt ?? claimStartedAt,
      },
    });
    if (claim.count !== 1) { skipped++; continue; }

    const item = await prisma.followUp.findUnique({
      where: { id: candidate.id, workspaceId: candidate.workspaceId },
      include: {
        workspace: true,
        feedback: { include: { customer: true, branch: true } },
      },
    });
    if (!item) { skipped++; continue; }

    const customer = item.feedback.customer;
    if (!canDispatchFollowUp(item.feedback.status, customer.email, customer.optedOutAt)) {
      await prisma.followUp.updateMany({ where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" }, data: { status: "CANCELLED", processingAt: null } });
      continue;
    }

    // Re-read consent and queue state immediately before dispatch. An opt-out
    // can cancel PROCESSING jobs while the worker is preparing the email.
    const finalCheck = await prisma.followUp.findFirst({
      where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
      select: {
        feedback: {
          select: {
            status: true,
            customer: { select: { email: true, optedOutAt: true } },
          },
        },
      },
    });
    const recipientEmail = finalCheck?.feedback.customer.email;
    if (
      !finalCheck ||
      !recipientEmail ||
      !canDispatchFollowUp(
        finalCheck.feedback.status,
        recipientEmail,
        finalCheck.feedback.customer.optedOutAt,
      )
    ) {
      await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
        data: { status: "CANCELLED", processingAt: null },
      });
      continue;
    }

    // A retry must reproduce the same email body for Resend's idempotency
    // check. Use the immutable follow-up creation time rather than a fresh
    // timestamp on each worker attempt.
    const tokenIssuedAt = Math.floor(item.createdAt.getTime() / 1000);
    if (Math.floor(Date.now() / 1000) >= tokenIssuedAt + FEEDBACK_TOKEN_TTL_SECONDS) {
      await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          processingAt: null,
          error: "Feedback link lifetime elapsed before dispatch; create a new feedback request instead of sending an expired link.",
        },
      });
      failed++;
      continue;
    }
    const token = createFeedbackToken(item.feedback.id, tokenIssuedAt);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const feedbackUrl = appUrl + "/api/feedback/" + item.feedback.id + "/click?t=" + token;
    const optOutUrl = appUrl + "/feedback/" + item.feedback.id + "/optout?t=" + token;

    try {
      const result = await sendEmail({
        to: recipientEmail,
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

      const completed = await prisma.$transaction(async (tx) => {
        const claimed = await tx.followUp.updateMany({
          where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
          data: { status: "SENT", sentAt: new Date(), providerId: result.id ?? null, processingAt: null, error: null },
        });
        if (claimed.count !== 1) return false;

        // Do not overwrite an opt-out, reply, resolution or other state change
        // that occurred while the provider request was in flight.
        await tx.feedback.updateMany({
          where: { id: item.feedbackId, workspaceId: item.workspaceId, status: "PENDING" },
          data: { sentAt: new Date(), status: "CONTACTED" },
        });
        return true;
      });
      if (completed) sent++;
      else skipped++;
    } catch (error) {
      await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          processingAt: null,
          error: error instanceof Error ? error.message.slice(0, 500) : "Unknown email error",
        },
      });
      failed++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed, skipped });
}
