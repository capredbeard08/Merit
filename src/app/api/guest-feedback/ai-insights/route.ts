import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { consumePlatformRateLimit } from "@/lib/platform-rate-limit";
import { analyzeGuestFeedbackThemes } from "@/lib/ai/groq";
import { writeAuditLog } from "@/lib/audit";

const requestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  confirmExternalProcessing: z.literal(true),
}).strict();

const MAX_REQUEST_BYTES = 4096;

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES || !request.body) return null;

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
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const rawBody = await readBoundedJson(request);
  if (rawBody === null) {
    return NextResponse.json({ error: "A valid, bounded JSON request is required." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const workspaceOnly = z.object({ workspaceId: z.string().trim().min(1).max(128) }).passthrough().safeParse(rawBody);
    if (workspaceOnly.success) {
      return NextResponse.json({
        error: "Explicit confirmation is required before guest comments are sent to Groq.",
      }, { status: 428 });
    }
    return NextResponse.json({ error: "Choose a valid workspace and confirm external processing." }, { status: 400 });
  }

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
    select: { role: true },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "ai:use")) {
    return NextResponse.json({ error: "You don't have permission to use AI analysis in this workspace." }, { status: 403 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "AI analysis is not configured for this environment." }, { status: 503 });
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
  const writtenFeedback = feedback.filter((entry) => Boolean(entry.message?.trim()));

  try {
    // Log the explicit external-processing decision before any comment leaves MERIT.
    // Never put guest comments, names, IDs, or raw request bodies in the audit record.
    await writeAuditLog({
      workspaceId: parsed.data.workspaceId,
      actorUserId: session.user.id,
      action: "GUEST_FEEDBACK_AI_ANALYSIS_REQUESTED",
      targetType: "GUEST_FEEDBACK_AI_ANALYSIS",
      metadata: {
        provider: "GROQ",
        operation: "THEME_ANALYSIS",
        externalProcessingConfirmed: true,
        submittedCount: writtenFeedback.length,
        personalDataHandling: "PATTERN_REDACTION_NOT_ANONYMIZATION",
      },
      request,
    });

    const analysis = await analyzeGuestFeedbackThemes(writtenFeedback.map((entry) => ({
      rating: ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as const)[entry.rating],
      message: entry.message || "",
    })));
    return NextResponse.json({ analysis, analyzedCount: writtenFeedback.length });
  } catch {
    return NextResponse.json({
      error: "AI analysis is temporarily unavailable. Your feedback has not been changed.",
    }, { status: 503 });
  }
}
