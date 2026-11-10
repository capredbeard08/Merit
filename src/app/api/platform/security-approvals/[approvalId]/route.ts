export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requirePlatformCapability } from "@/lib/platform-admin";
import { approveFounderSecurityAction } from "@/lib/security-warden-approvals";

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "DENY"]),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
): Promise<Response> {
  const authz = await requirePlatformCapability(
    request,
    "platform:security:approve",
    true,
    {
      requireRecentAuthentication: true,
      requireMfa: true,
      rateLimit: { action: "red-squid-approval-decision", limit: 8, windowMs: 15 * 60 * 1000 },
    },
  );
  if (!authz.ok) return authz.response;

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose APPROVE or DENY" }, { status: 400 });
  }

  const { approvalId } = await context.params;
  if (!approvalId || approvalId.length > 128) {
    return NextResponse.json({ error: "Invalid approval identifier" }, { status: 400 });
  }

  try {
    await approveFounderSecurityAction({
      approvalId,
      actorUserId: authz.session.user.id,
      sessionId: authz.session.session.id,
      decision: parsed.data.decision,
    });
    return NextResponse.json({ success: true, decision: parsed.data.decision }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code :
      error instanceof Error ? error.message : "APPROVAL_DECISION_FAILED";
    const conflictCodes = new Set([
      "APPROVAL_NOT_PENDING_OR_EXPIRED",
      "APPROVAL_ALREADY_DECIDED",
      "APPROVAL_SCOPE_INTEGRITY_FAILURE",
      "ARTIFACT_ACTION_NOT_ALLOWED",
      "ARTIFACT_SCOPE_MISMATCH",
      "P2034",
    ]);
    if (code === "FOUNDER_SUPER_ADMIN_REQUIRED" || code === "FOUNDER_MFA_REQUIRED") {
      return NextResponse.json({ error: "Founder access and authenticator MFA are required" }, { status: 403 });
    }
    if (code === "FRESH_SESSION_REQUIRED") {
      return NextResponse.json({ error: "Sign in again and complete MFA before deciding" }, { status: 428 });
    }
    if (conflictCodes.has(code)) {
      return NextResponse.json({ error: "This approval is no longer valid. Refresh the incident and review its current state." }, { status: 409 });
    }
    console.error("[MERIT Red Squid] approval decision failed", { code });
    return NextResponse.json({ error: "Unable to record the approval decision" }, { status: 500 });
  }
}
