import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";

const submissionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(2000).optional(),
  submissionKey: z.string().uuid(),
});

function hashSubmissionKey(qrCodeId: string, submissionKey: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured correctly");
  return createHmac("sha256", secret)
    .update("merit-guest-feedback:v1:" + qrCodeId + ":" + submissionKey)
    .digest("hex");
}

function ratingValue(rating: number) {
  return (["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const)[rating - 1];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await context.params;
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(publicId)) {
    return NextResponse.json({ error: "This feedback link is invalid or unavailable." }, { status: 404 });
  }

  const qrCode = await prisma.guestQrCode.findFirst({
    where: {
      publicId,
      status: "ACTIVE",
      branch: { archivedAt: null },
    },
    select: {
      id: true,
      workspaceId: true,
      branchId: true,
      branch: {
        select: {
          name: true,
          googleReviewUrl: true,
          workspaceId: true,
          archivedAt: true,
        },
      },
    },
  });

  if (!qrCode || qrCode.branch.workspaceId !== qrCode.workspaceId || qrCode.branch.archivedAt) {
    return NextResponse.json({ error: "This feedback link is no longer available." }, { status: 404 });
  }

  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a rating and try again." }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwardedFor || "unknown";
  const [ipLimit, qrLimit] = await Promise.all([
    consumePlatformRateLimit(ip + ":" + publicId, "guest-feedback-ip", 5, 10 * 60 * 1000),
    consumePlatformRateLimit(publicId, "guest-feedback-qr", 60, 10 * 60 * 1000),
  ]);

  if (!ipLimit.allowed || !qrLimit.allowed) {
    const retryAfter = Math.max(
      ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds,
      qrLimit.allowed ? 0 : qrLimit.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "You've submitted feedback recently. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const submissionKeyHash = hashSubmissionKey(qrCode.id, parsed.data.submissionKey);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.guestFeedback.create({
        data: {
          workspaceId: qrCode.workspaceId,
          branchId: qrCode.branchId,
          qrCodeId: qrCode.id,
          rating: ratingValue(parsed.data.rating),
          message: parsed.data.message || null,
          submissionKeyHash,
          source: "PERMANENT_QR",
        },
      });
      await tx.guestQrCode.update({
        where: { id: qrCode.id },
        data: { lastUsedAt: new Date() },
      });
    });
  } catch (error) {
    // A retried request with the same idempotency key is already safely stored.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ accepted: true, googleReviewUrl: qrCode.branch.googleReviewUrl });
    }
    console.error("[MERIT guest feedback] submission failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "We couldn't save your feedback. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, googleReviewUrl: qrCode.branch.googleReviewUrl });
}
