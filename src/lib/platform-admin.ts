import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform, type PlatformCapability } from "@/lib/platform-access";
import { isSameOriginRequest } from "@/lib/founder-bootstrap";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";

export async function requirePlatformCapability(
  request: Request,
  capability: PlatformCapability,
  enforceSameOrigin = false,
  options: {
    requireRecentAuthentication?: boolean;
    rateLimit?: { action: string; limit: number; windowMs: number };
  } = {},
) {
  if (enforceSameOrigin && !isSameOriginRequest(request.headers.get("origin"), request.url)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }),
    };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  if (options.requireRecentAuthentication) {
    const authenticatedAt = session.session.createdAt;
    const ageMs = Date.now() - new Date(authenticatedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10 * 60 * 1000) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Fresh authentication required. Sign in again before this sensitive action." },
          { status: 428 },
        ),
      };
    }
  }

  const access = await prisma.platformAccess.findUnique({
    where: { userId: session.user.id },
    select: { role: true, revokedAt: true },
  });

  if (!canAccessPlatform(access, capability)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Insufficient platform permissions" }, { status: 403 }),
    };
  }

  if (options.rateLimit) {
    const limit = await consumePlatformRateLimit(
      session.user.id,
      options.rateLimit.action,
      options.rateLimit.limit,
      options.rateLimit.windowMs,
    );
    if (!limit.allowed) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Too many requests. Try again later." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        ),
      };
    }
  }

  return { ok: true as const, session, access };
}

export function platformRequestContext(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
      ?? request.headers.get("x-real-ip")?.slice(0, 64)
      ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}
