export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformCapability } from "@/lib/platform-admin";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  status: z.enum(["OPEN", "TRIAGED", "INVESTIGATING", "CONTAINED", "AWAITING_APPROVAL", "RESOLVED", "FALSE_POSITIVE", "CLOSED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:security:read");
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid incident filters" }, { status: 400 });

  const limit = parsed.data.limit;
  const incidents = await prisma.securityIncident.findMany({
    where: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.severity ? { severity: parsed.data.severity } : {}),
    },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      status: true,
      severity: true,
      confidence: true,
      source: true,
      summary: true,
      firstSeenAt: true,
      lastSeenAt: true,
      createdAt: true,
      workspaceId: true,
      findings: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          hunterType: true,
          detector: true,
          ruleVersion: true,
          filePath: true,
          lineStart: true,
          lineEnd: true,
          confidence: true,
          severity: true,
          createdAt: true,
        },
      },
      artifacts: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          sha256: true,
          sizeBytes: true,
          contentType: true,
          storageState: true,
          scannerVerdict: true,
          scannerName: true,
          scannerVersion: true,
          scannedAt: true,
          retainedUntil: true,
          createdAt: true,
        },
      },
      hunterRuns: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          hunterType: true,
          engine: true,
          engineVersion: true,
          status: true,
          attemptCount: true,
          summary: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
      },
      approvals: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          actionType: true,
          status: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = incidents.length > limit;
  const page = (hasMore ? incidents.slice(0, limit) : incidents).map((incident) => ({
    ...incident,
    workspaceScoped: Boolean(incident.workspaceId),
    workspaceId: undefined,
    artifacts: incident.artifacts.map((artifact) => ({
      ...artifact,
      sizeBytes: artifact.sizeBytes.toString(),
    })),
  }));

  return NextResponse.json({
    incidents: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    limit,
  }, { headers: { "Cache-Control": "no-store" } });
}
