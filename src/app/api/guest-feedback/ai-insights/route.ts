import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";
import { analyzeGuestFeedbackThemes } from "@/lib/ai/groq";

const requestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
}).strict();

const MAX_REQUEST_BYTES = 4096;

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = requestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid workspace." }, { status: 400 });
  }

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
    select: { role: true },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "ai:use")) {
    return NextResponse.json({ error: "You don't have permission to use AI analysis in this workspace." }, { status: 403 });
  }

  const limit = await consumePlatformRateLimit(session.user.id, "groq-guest-feedback-themes", 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "AI analysis limit reached. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const feedback = await prisma.guestFeedback.findMany({
    where: { workspaceId: parsed.data.workspaceId, message: { not: null } },
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
