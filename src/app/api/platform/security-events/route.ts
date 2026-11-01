export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformCapability } from "@/lib/platform-admin";
import {
  platformSecurityEventTypes,
  platformEventsToCsv,
  sanitizePlatformEventMetadata,
} from "@/lib/platform-security-events";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  type: z.enum(platformSecurityEventTypes).optional(),
  format: z.enum(["json", "csv"]).default("json"),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid security-event filters" }, { status: 400 });
  }

  const format = parsed.data.format;
  const authz = await requirePlatformCapability(
    request,
    format === "csv" ? "platform:audit:export" : "platform:security:read",
  );
  if ("response" in authz) return authz.response;

  const limit = format === "csv" ? 500 : parsed.data.limit;
  const events = await prisma.securityEvent.findMany({
    where: {
      workspaceId: null,
      type: { in: parsed.data.type ? [parsed.data.type] : [...platformSecurityEventTypes] },
      ...(parsed.data.severity ? { severity: parsed.data.severity } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(format === "json" && parsed.data.cursor ? {
      cursor: { id: parsed.data.cursor },
      skip: 1,
    } : {}),
    take: limit + (format === "json" ? 1 : 0),
    select: {
      id: true,
      type: true,
      severity: true,
      actorUserId: true,
      targetId: true,
      metadata: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });

  const hasMore = format === "json" && events.length > limit;
  const page = (hasMore ? events.slice(0, limit) : events).map((event) => ({
    ...event,
    metadata: sanitizePlatformEventMetadata(event.metadata),
  }));

  if (format === "csv") {
    const csv = platformEventsToCsv(page);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="merit-platform-security-events.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return NextResponse.json({
    events: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    limit,
  }, { headers: { "Cache-Control": "no-store" } });
}
