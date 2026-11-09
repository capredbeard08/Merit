import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeSecurityMetadata } from "@/lib/security-warden";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, legalHoldAt: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await request.json() as { action?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action !== "place" && action !== "release") {
    return NextResponse.json({ error: "Action must be place or release." }, { status: 400 });
  }
  if (reason.length < 10 || reason.length > 1000) {
    return NextResponse.json({ error: "Provide a reason between 10 and 1000 characters." }, { status: 400 });
  }
  if (action === "release" && member.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can release a legal hold." }, { status: 403 });
  }

  const now = new Date();
  const headers = request.headers;
  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.fileAsset.updateMany({
      where: {
        id: file.id,
        workspaceId: file.workspaceId,
        ...(action === "place" ? { legalHoldAt: null } : { legalHoldAt: { not: null } }),
      },
      data: action === "place"
        ? { legalHoldAt: now, legalHoldById: session.user.id, legalHoldReason: reason }
        : { legalHoldAt: null, legalHoldById: null, legalHoldReason: null },
    });
    if (result.count !== 1) return false;

    await tx.auditLog.create({
      data: {
        workspaceId: file.workspaceId,
        actorUserId: session.user.id,
        action: action === "place" ? "FILE_LEGAL_HOLD_PLACED" : "FILE_LEGAL_HOLD_RELEASED",
        targetType: "FILE_ASSET",
        targetId: file.id,
        metadata: sanitizeSecurityMetadata({ reason, action }),
        ipAddress: headers.get("x-real-ip")?.slice(0, 64) ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
        userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
      },
    });
    return true;
  });

  if (!changed) return NextResponse.json({ error: action === "place" ? "A legal hold is already active." : "No active legal hold exists." }, { status: 409 });
  return NextResponse.json({ success: true, legalHoldAt: action === "place" ? now.toISOString() : null });
}
