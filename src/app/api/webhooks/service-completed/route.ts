import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { serviceCompletedEventSchema } from "@/lib/security";
import { WEBHOOK_MAX_AGE_SECONDS, WEBHOOK_MAX_BODY_BYTES, WEBHOOK_MAX_FUTURE_SECONDS } from "@/lib/env";

export const runtime = "nodejs";

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function secretsMatch(provided: string, storedHash: string) {
  const a = Buffer.from(hashSecret(provided), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const providedSecret = request.headers.get("x-merit-webhook-secret");
  if (!providedSecret || providedSecret.length > 256) {
    return NextResponse.json({ error: "Webhook secret required" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large or empty" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = serviceCompletedEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }

  const occurredAt = Date.parse(parsed.data.occurredAt);
  if (!Number.isFinite(occurredAt)) {
    return NextResponse.json({ error: "Invalid event timestamp" }, { status: 400 });
  }

  const now = Date.now();
  if (occurredAt < now - WEBHOOK_MAX_AGE_SECONDS * 1000 || occurredAt > now + WEBHOOK_MAX_FUTURE_SECONDS * 1000) {
    return NextResponse.json({ error: "Event timestamp outside replay window" }, { status: 409 });
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspaceId: parsed.data.workspaceId, revokedAt: null },
  });
  const endpoint = endpoints.find((candidate) => secretsMatch(providedSecret, candidate.secretHash));

  if (!endpoint) return NextResponse.json({ error: "Invalid webhook credentials" }, { status: 401 });

  if (endpoint.branchId && endpoint.branchId !== parsed.data.branchId) {
    return NextResponse.json({ error: "Webhook is not authorized for this branch" }, { status: 403 });
  }

  const existing = await prisma.serviceEvent.findFirst({
    where: { workspaceId: parsed.data.workspaceId, externalId: parsed.data.eventId },
    select: { id: true, feedback: { select: { id: true } } },
  });

  if (existing) {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      eventId: parsed.data.eventId,
      feedbackId: existing.feedback?.id ?? null,
    }, { status: 202 });
  }

  const branch = await prisma.branch.findFirst({
    where: { id: parsed.data.branchId, workspaceId: parsed.data.workspaceId },
    select: { id: true },
  });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: {
          workspaceId_externalId: {
            workspaceId: parsed.data.workspaceId,
            externalId: parsed.data.customer.externalId,
          },
        },
        create: {
          workspaceId: parsed.data.workspaceId,
          branchId: parsed.data.branchId,
          externalId: parsed.data.customer.externalId,
          name: parsed.data.customer.name ?? null,
          email: parsed.data.customer.email ?? null,
          phone: parsed.data.customer.phone ?? null,
          consentAt: parsed.data.consent.feedbackContact ? new Date(parsed.data.consent.recordedAt) : null,
        },
        update: {
          branchId: parsed.data.branchId,
          name: parsed.data.customer.name ?? undefined,
          email: parsed.data.customer.email ?? undefined,
          phone: parsed.data.customer.phone ?? undefined,
          ...(parsed.data.consent.feedbackContact
            ? { consentAt: new Date(parsed.data.consent.recordedAt), optedOutAt: null }
            : {}),
        },
      });

      const event = await tx.serviceEvent.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          branchId: parsed.data.branchId,
          customerId: customer.id,
          externalId: parsed.data.eventId,
          type: parsed.data.service.type ?? null,
          completedAt: new Date(parsed.data.service.completedAt),
          payloadHash: createHash("sha256").update(rawBody).digest("hex"),
        },
      });

      if (!parsed.data.consent.feedbackContact) return { eventId: event.id, feedbackId: null };

      const feedback = await tx.feedback.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          branchId: parsed.data.branchId,
          customerId: customer.id,
          serviceEventId: event.id,
          status: "PENDING",
        },
      });

      await tx.followUp.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          feedbackId: feedback.id,
          channel: "email",
          status: "QUEUED",
          scheduledAt: new Date(Date.now() + 3 * 60 * 1000),
        },
      });

      return { eventId: event.id, feedbackId: feedback.id };
    });

    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({
      accepted: true,
      eventId: parsed.data.eventId,
      feedbackId: result.feedbackId,
    }, { status: 202 });
  } catch (error) {
    const duplicate = await prisma.serviceEvent.findFirst({
      where: { workspaceId: parsed.data.workspaceId, externalId: parsed.data.eventId },
      select: { id: true, feedback: { select: { id: true } } },
    });

    if (duplicate) {
      return NextResponse.json({
        accepted: true,
        duplicate: true,
        eventId: parsed.data.eventId,
        feedbackId: duplicate.feedback?.id ?? null,
      }, { status: 202 });
    }

    console.error("MERIT webhook transaction failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
