import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform, type PlatformCapability } from "@/lib/platform-access";
import { isSameOriginRequest } from "@/lib/founder-bootstrap";

export async function requirePlatformCapability(
  request: Request,
  capability: PlatformCapability,
  enforceSameOrigin = false,
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
