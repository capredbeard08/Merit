import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest, matchesFounderBootstrapSecret } from "@/lib/founder-bootstrap";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";

const bodySchema = z.object({
  bootstrapSecret: z.string().min(32).max(256),
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request.headers.get("origin"), request.url)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const authenticatedAt = new Date(session.session.createdAt).getTime();
  if (!Number.isFinite(authenticatedAt) || Date.now() - authenticatedAt > 10 * 60 * 1000 || Date.now() < authenticatedAt) {
    return NextResponse.json({ error: "Fresh authentication required. Sign in again before founder bootstrap." }, { status: 428 });
  }
  if (!session.user.emailVerified) {
    return NextResponse.json({ error: "A verified email address is required" }, { status: 403 });
  }

  const rateLimit = await consumePlatformRateLimit(session.user.id, "founder-bootstrap", 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many bootstrap attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const configuredSecret = process.env.FOUNDER_BOOTSTRAP_SECRET;
  if (!configuredSecret || Buffer.byteLength(configuredSecret, "utf8") < 32) {
    return NextResponse.json({ error: "Founder bootstrap is not configured" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2048) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bootstrap request" }, { status: 400 });
  }
  if (!matchesFounderBootstrapSecret(parsed.data.bootstrapSecret, configuredSecret)) {
    return NextResponse.json({ error: "Bootstrap authorization failed" }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Count revoked founder records too: the bootstrap is a one-time ceremony,
      // not a reusable route for transferring or restoring founder privileges.
      const founderAssignments = await tx.platformAccess.count({
        where: { role: "FOUNDER_SUPER_ADMIN" },
      });
      if (founderAssignments > 0) {
        return { granted: false as const, reason: "already_bootstrapped" as const };
      }

      const existingAccess = await tx.platformAccess.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (existingAccess) {
        return { granted: false as const, reason: "user_already_has_platform_access" as const };
      }

      const access = await tx.platformAccess.create({
        data: {
          userId: session.user.id,
          role: "FOUNDER_SUPER_ADMIN",
          grantedByUserId: session.user.id,
        },
        select: { id: true, role: true },
      });

      await tx.securityEvent.create({
        data: {
          actorUserId: session.user.id,
          type: "FOUNDER_SUPER_ADMIN_BOOTSTRAPPED",
          severity: "HIGH",
          targetId: session.user.id,
          metadata: {
            accessId: access.id,
            role: access.role,
            reason: "initial_founder_bootstrap",
          },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
            ?? request.headers.get("x-real-ip")?.slice(0, 64)
            ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });

      return { granted: true as const, role: access.role };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (!result.granted) {
      return NextResponse.json(
        { error: result.reason === "already_bootstrapped"
          ? "Founder bootstrap has already been completed"
          : "This account already has platform access" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      role: result.role,
      message: "Founder Super Admin access granted. Remove FOUNDER_BOOTSTRAP_SECRET from the deployment environment now.",
    });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "BOOTSTRAP_FAILED";
    if (code === "P2002" || code === "P2034") {
      return NextResponse.json({ error: "Founder bootstrap has already been completed or is being completed" }, { status: 409 });
    }
    console.error("[MERIT founder bootstrap] failed", { code });
    return NextResponse.json({ error: "Founder bootstrap failed. Please contact support." }, { status: 500 });
  }
}
