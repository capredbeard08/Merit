import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";
import { analyzeGuestFeedbackThemes } from "@/lib/ai/groq";

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { workspaceId?: unknown } | null;
  if (!body || typeof body.workspaceId !== "string" || body.workspaceId.length < 1 || body.workspaceId.length > 128) {
    return NextResponse.json({ error: "Choose a valid workspace." }, { status: 400 });
  }

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: session.user.id } },
    select: { role: true },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "feedback:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = await consumePlatformRateLimit(session.user.id, "groq-guest-feedback-themes", 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "AI analysis limit reached. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const feedback = await prisma.guestFeedback.findMany({
    where: { workspaceId: body.workspaceId, message: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 100,
    select: { rating: true, message: true },
  });
  try {
    const analysis = await analyzeGuestFeedbackThemes(feedback.map((entry) => ({
      rating: ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as const)[entry.rating],
      message: entry.message || "",
    })));
    return NextResponse.json({ analysis, analyzedCount: feedback.length });
  } catch {
    return NextResponse.json({ error: "AI analysis is temporarily unavailable. Your feedback has not been changed." }, { status: 503 });
  }
}
