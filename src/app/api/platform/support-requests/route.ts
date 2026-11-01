export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformCapability, platformRequestContext } from "@/lib/platform-admin";

const scopes = ["CUSTOMER_RECORDS_READ", "FEEDBACK_READ", "FEEDBACK_REPLIES_READ", "FILE_ASSETS_READ"] as const;
const requestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  scope: z.enum(scopes),
  reason: z.string().trim().min(20).max(500),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(240)]),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:security:read");
  if ("response" in authz) return authz.response;

  const requests = await prisma.supportAccessRequest.findMany({
    where: { requestedByUserId: authz.session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, workspaceId: true, scope: true, status: true, reason: true,
      requestedDurationMinutes: true, requestExpiresAt: true, decidedAt: true,
      expiresAt: true, revokedAt: true, createdAt: true,
      workspace: { select: { name: true } },
    },
  });
  const now = new Date();
  return NextResponse.json({
    requests: requests.map((item) => ({
      ...item,
      effectiveStatus: (item.status === "PENDING" && item.requestExpiresAt <= now)
        || (item.status === "APPROVED" && (!item.expiresAt || item.expiresAt <= now))
        ? "EXPIRED" : item.status,
    })),
    limit: 50,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const authz = await requirePlatformCapability(request, "platform:security:read", true);
  if ("response" in authz) return authz.response;

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2048) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a workspace, exact read-only scope, reason (20–500 characters), and allowed duration" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: parsed.data.workspaceId },
        select: { id: true, name: true },
      });
      if (!workspace) return { kind: "not_found" as const };

      const now = new Date();
      const duplicate = await tx.supportAccessRequest.findFirst({
        where: {
          workspaceId: workspace.id,
          requestedByUserId: authz.session.user.id,
          scope: parsed.data.scope,
          OR: [
            { status: "PENDING", requestExpiresAt: { gt: now } },
            { status: "APPROVED", revokedAt: null, expiresAt: { gt: now } },
          ],
        },
        select: { id: true },
      });
      if (duplicate) return { kind: "pending" as const };

      const supportRequest = await tx.supportAccessRequest.create({
        data: {
          workspaceId: workspace.id,
          requestedByUserId: authz.session.user.id,
          scope: parsed.data.scope,
          reason: parsed.data.reason,
          requestedDurationMinutes: parsed.data.durationMinutes,
          requestExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        select: { id: true, workspaceId: true, scope: true, status: true, requestedDurationMinutes: true, requestExpiresAt: true },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: authz.session.user.id,
          action: "SUPPORT_ACCESS_REQUESTED",
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: supportRequest.id,
          metadata: { scope: supportRequest.scope, durationMinutes: String(supportRequest.requestedDurationMinutes) },
          ...platformRequestContext(request),
        },
      });
      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: authz.session.user.id,
          type: "SUPPORT_ACCESS_REQUESTED",
          severity: "HIGH",
          targetId: workspace.id,
          metadata: {
            supportAccessRequestId: supportRequest.id,
            scope: supportRequest.scope,
            reason: "business_approval_requested",
          },
          ...platformRequestContext(request),
        },
      });
      return { kind: "created" as const, workspace, supportRequest };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    if (result.kind === "pending") return NextResponse.json({ error: "A matching request is already awaiting business approval" }, { status: 409 });
    return NextResponse.json({
      success: true,
      request: { ...result.supportRequest, workspaceName: result.workspace.name },
      message: "Request submitted. No workspace data is accessible unless an authorised business member approves it.",
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "SUPPORT_ACCESS_REQUEST_FAILED";
    if (code === "P2034") return NextResponse.json({ error: "The request changed concurrently. Refresh and try again." }, { status: 409 });
    console.error("[MERIT support access] request failed", { code });
    return NextResponse.json({ error: "Unable to submit support access request" }, { status: 500 });
  }
}
