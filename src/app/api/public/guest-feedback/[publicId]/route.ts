import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";
import { feedbackRatingValue, hashGuestSubmissionKey, isGuestPublicId, safeGoogleReviewUrl } from "@/lib/guest-feedback";

const submissionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(2000).optional(),
  submissionKey: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await context.params;
  if (!isGuestPublicId(publicId)) {
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

  const submissionKeyHash = hashGuestSubmissionKey(qrCode.id, parsed.data.submissionKey);

  try {
    const acceptedQr = await prisma.$transaction(async (tx) => {
      // Lock the QR row and re-check its lifecycle state inside the write
      // transaction. A concurrent pause/revocation must serialize with this
      // submission rather than race the earlier public lookup.
      const activeQr = await tx.$queryRaw<Array<{
        id: string;
        workspaceId: string;
        branchId: string;
        googleReviewUrl: string | null;
      }>>(Prisma.sql`
        SELECT q."id", q."workspaceId", q."branchId", b."googleReviewUrl"
        FROM "GuestQrCode" q
        INNER JOIN "Branch" b
          ON b."id" = q."branchId"
         AND b."workspaceId" = q."workspaceId"
        WHERE q."id" = ${qrCode.id}
          AND q."publicId" = ${publicId}
          AND q."status" = 'ACTIVE'::"GuestQrCodeStatus"
          AND b."archivedAt" IS NULL
        FOR UPDATE OF q
      `);

      const currentQr = activeQr[0];
      if (!currentQr) return null;

      await tx.guestFeedback.create({
        data: {
          workspaceId: currentQr.workspaceId,
          branchId: currentQr.branchId,
          qrCodeId: currentQr.id,
          rating: feedbackRatingValue(parsed.data.rating),
          message: parsed.data.message || null,
          submissionKeyHash,
          source: "PERMANENT_QR",
        },
      });
      await tx.guestQrCode.update({
        where: { id: currentQr.id },
        data: { lastUsedAt: new Date() },
      });
      return currentQr;
    });

    if (!acceptedQr) {
      return NextResponse.json({ error: "This feedback link is no longer available." }, { status: 404 });
    }
  } catch (error) {
    // A retried request with the same idempotency key is already safely stored.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ accepted: true, googleReviewUrl: safeGoogleReviewUrl(qrCode.branch.googleReviewUrl) });
    }
    console.error("[MERIT guest feedback] submission failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "We couldn't save your feedback. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, googleReviewUrl: safeGoogleReviewUrl(qrCode.branch.googleReviewUrl) });
}
