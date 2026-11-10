import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, feedbackEmailHtml } from "@/lib/email";
import { createFeedbackToken, FEEDBACK_TOKEN_TTL_SECONDS } from "@/lib/feedback-token";

const PROVIDER_IDEMPOTENCY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-merit-cron-secret");
  const authorization = request.headers.get("authorization");
  const valid = !!secret && (headerSecret === secret || authorization === "Bearer " + secret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const staleClaim = new Date(now.getTime() - 10 * 60 * 1000);
  // Provider idempotency windows are finite. Never blindly retry an ambiguous
  // request after 23 hours; leave a one-hour safety margin before provider expiry.
  const safeRetryCutoff = new Date(now.getTime() - PROVIDER_IDEMPOTENCY_RETRY_WINDOW_MS);
  await prisma.followUp.updateMany({
    where: {
      status: { in: ["PROCESSING", "QUEUED"] },
      firstAttemptAt: { lt: safeRetryCutoff },
    },
    data: {
      status: "FAILED",
      failedAt: now,
      processingAt: null,
      error: "Provider outcome is unknown and the idempotency window has elapsed; manual reconciliation is required.",
    },
  });
  // Jobs already processing before this field was introduced have an unknown
  // provider outcome. Do not resend them automatically.
  await prisma.followUp.updateMany({
    where: { status: "PROCESSING", processingAt: { lt: staleClaim }, firstAttemptAt: null },
    data: {
      status: "FAILED",
      failedAt: now,
      processingAt: null,
      error: "Legacy processing attempt has no durable first-attempt timestamp; manual reconciliation is required.",
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
    if (!customer.email || customer.optedOutAt || item.feedback.status === "OPTED_OUT") {
      await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
        data: { status: "CANCELLED", processingAt: null },
      });
      continue;
    }

    // Re-read consent and queue ownership immediately before dispatch.
    const dispatchState = await prisma.followUp.findFirst({
      where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
      include: { feedback: { include: { customer: true } } },
    });
    if (
      !dispatchState ||
      dispatchState.feedback.customer.optedOutAt ||
      dispatchState.feedback.status === "OPTED_OUT" ||
      !dispatchState.feedback.customer.email
    ) {
      await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
        data: { status: "CANCELLED", processingAt: null },
      });
      skipped++;
      continue;
    }

    // Use the persisted first-attempt timestamp so a provider retry reproduces
    // the exact same signed feedback/opt-out links and idempotency payload.
    const tokenIssuedAt = Math.floor((item.firstAttemptAt ?? item.createdAt).getTime() / 1000);
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
    const optOutUrl = appUrl + "/api/feedback/" + item.feedback.id + "/optout?t=" + token;

    try {
      const result = await sendEmail({
        to: dispatchState.feedback.customer.email,
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
          where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
          data: { status: "SENT", sentAt: new Date(), providerId: result.id ?? null, processingAt: null, error: null },
        });
        if (owned.count === 1) {
          await tx.feedback.updateMany({
            where: { id: item.feedbackId, workspaceId: item.workspaceId, status: "PENDING" },
            data: { sentAt: new Date(), status: "CONTACTED" },
          });
        }
        return owned.count;
      });
      if (finalized === 1) sent++;
      else skipped++;
    } catch (error) {
      const markedFailed = await prisma.followUp.updateMany({
        where: { id: item.id, workspaceId: item.workspaceId, status: "PROCESSING" },
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
