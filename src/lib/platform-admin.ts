import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform, type PlatformCapability } from "@/lib/platform-access";

export async function requirePlatformCapability(
  request: Request,
  capability: PlatformCapability,
) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
    return {
      response: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }),
    } as const;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    } as const;
  }

  const access = await prisma.platformAccess.findUnique({
    where: { userId: session.user.id },
    select: { role: true, revokedAt: true },
  });

  if (!canAccessPlatform(access, capability)) {
    return {
      response: NextResponse.json({ error: "Insufficient platform permissions" }, { status: 403 }),
    } as const;
  }

  return { session, access } as const;
}

export function platformRequestContext(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
      ?? request.headers.get("x-real-ip")?.slice(0, 64)
      ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}
