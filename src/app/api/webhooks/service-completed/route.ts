import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { serviceCompletedEventSchema } from "@/lib/security";

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
  if (!providedSecret) {
    return NextResponse.json({ error: "Webhook secret required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = serviceCompletedEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      workspaceId: parsed.data.workspaceId,
      revokedAt: null,
    },
  });
  const endpoint = endpoints.find((candidate) => secretsMatch(providedSecret, candidate.secretHash));

  if (!endpoint) {
    return NextResponse.json({ error: "Invalid webhook credentials" }, { status: 401 });
  }

  if (endpoint.branchId && endpoint.branchId !== parsed.data.branchId) {
    return NextResponse.json({ error: "Webhook is not authorized for this branch" }, { status: 403 });
  }

  const existing = await prisma.serviceEvent.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      externalId: parsed.data.eventId,
    },
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
        ...(parsed.data.consent.feedbackContact ? { consentAt: new Date(parsed.data.consent.recordedAt), optedOutAt: null } : {}),
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
        payloadHash: createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex"),
      },
    });

    if (!parsed.data.consent.feedbackContact) {
      return { eventId: event.id, feedbackId: null };
    }

    const feedback = await tx.feedback.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        branchId: parsed.data.branchId,
        customerId: customer.id,
        serviceEventId: event.id,
        status: "PENDING",
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
}
