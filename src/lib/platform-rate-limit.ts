import { createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RateLimitResult = { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter shared by all app instances through PostgreSQL.
 * The database stores only an HMAC of the subject/action, never the raw user ID.
 * Fails closed if the limiter store is unavailable.
 */
export async function consumePlatformRateLimit(
  subjectId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!subjectId || !action || !Number.isInteger(limit) || limit < 1 ||
      !Number.isInteger(windowMs) || windowMs < 1000) {
    throw new Error("Invalid platform rate-limit configuration");
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is required for platform rate limiting");
  }

  const key = createHmac("sha256", secret)
    .update("merit-platform-rate-limit:v1:" + action + ":" + subjectId)
    .digest("hex");

  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; windowStartedAt: Date }>>(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("id", "key", "windowStartedAt", "count", "expiresAt")
      VALUES (${randomUUID()}, ${key}, NOW(), 1, NOW() + INTERVAL '24 hours')
      ON CONFLICT ("key") DO UPDATE SET
        "windowStartedAt" = CASE
          WHEN "RateLimitBucket"."windowStartedAt" <= NOW() - (${windowMs} * INTERVAL '1 millisecond')
          THEN NOW()
          ELSE "RateLimitBucket"."windowStartedAt"
        END,
        "count" = CASE
          WHEN "RateLimitBucket"."windowStartedAt" <= NOW() - (${windowMs} * INTERVAL '1 millisecond')
          THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "expiresAt" = NOW() + INTERVAL '24 hours'
      RETURNING "count", "windowStartedAt"
    `);

    const row = rows[0];
    if (!row) throw new Error("Rate-limit store returned no row");
    if (row.count <= limit) return { allowed: true, remaining: limit - row.count };

    const elapsed = Date.now() - new Date(row.windowStartedAt).getTime();
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
    };
  } catch (error) {
    console.error("[MERIT platform rate limit] store unavailable; failing closed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { allowed: false, retryAfterSeconds: 60 };
  }
}
