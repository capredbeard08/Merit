import { NextResponse } from "next/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/founder-bootstrap";

const scopes = ["CUSTOMER_RECORDS_READ", "FEEDBACK_READ", "FEEDBACK_REPLIES_READ", "FILE_ASSETS_READ"] as const;
const requestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  scope: z.enum(scopes),
  reason: z.string().trim().min(20).max(500),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(240)]),
}).strict();

type SessionLike = { user: { id: string } };
type Authorization = { ok: true; session: SessionLike } | { ok: false; response: Response };

export function createSupportAccessRequestHandler(dependencies: {
  prisma: PrismaClient;
  authorize: (request: Request) => Promise<Authorization>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const authz = await dependencies.authorize(request);
    if (!authz.ok) return authz.response;

    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 2048) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Provide a workspace, exact read-only scope, reason (20–500 characters), and allowed duration" }, { status: 400 });

    try {
      const result = await dependencies.prisma.$transaction(async (tx) => {
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
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
              ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
              ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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
  };
}

export function createSupportAccessRequesterCancelHandler(dependencies: {
  prisma: PrismaClient;
  getSession: (headers: Headers) => Promise<SessionLike | null>;
}) {
  return async function DELETE(
    request: Request,
    context: { params: Promise<{ requestId: string }> },
  ): Promise<Response> {
    const session = await dependencies.getSession(request.headers);
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!isSameOriginRequest(request.headers.get("origin"), request.url)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
    const { requestId } = await context.params;
    if (!requestId || requestId.length > 128) return NextResponse.json({ error: "Invalid request identifier" }, { status: 400 });

    try {
      const result = await dependencies.prisma.$transaction(async (tx) => {
        const supportRequest = await tx.supportAccessRequest.findFirst({
          where: { id: requestId, requestedByUserId: session.user.id },
          select: { id: true, workspaceId: true, scope: true, status: true, expiresAt: true },
        });
        if (!supportRequest) return { kind: "not_found" as const };
        if (supportRequest.status !== "PENDING" && supportRequest.status !== "APPROVED") {
          return { kind: "not_active" as const };
        }
        if (supportRequest.status === "APPROVED" && (!supportRequest.expiresAt || supportRequest.expiresAt <= new Date())) {
          return { kind: "not_active" as const };
        }

        const now = new Date();
        await tx.supportAccessRequest.update({
          where: { id: supportRequest.id },
          data: { status: "REVOKED", revokedAt: now, revokedByUserId: session.user.id },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: supportRequest.workspaceId,
            actorUserId: session.user.id,
            action: "SUPPORT_ACCESS_REVOKED",
            targetType: "SUPPORT_ACCESS_REQUEST",
            targetId: supportRequest.id,
            metadata: { scope: supportRequest.scope, supportAccessRequestId: supportRequest.id, reason: "requester_revoked_or_cancelled" },
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
              ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        await tx.securityEvent.create({
          data: {
            workspaceId: null,
            actorUserId: session.user.id,
            type: "SUPPORT_ACCESS_REVOKED",
            severity: "HIGH",
            targetId: supportRequest.workspaceId,
            metadata: { supportAccessRequestId: supportRequest.id, scope: supportRequest.scope, reason: "requester_revoked_or_cancelled" },
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
              ?? request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        return { kind: "revoked" as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (result.kind === "not_found") return NextResponse.json({ error: "Support access request not found" }, { status: 404 });
      if (result.kind === "not_active") return NextResponse.json({ error: "This request is no longer active" }, { status: 409 });
      return NextResponse.json({ success: true });
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "SUPPORT_ACCESS_REVOKE_FAILED";
      if (code === "P2034") return NextResponse.json({ error: "The request changed concurrently. Refresh and try again." }, { status: 409 });
      console.error("[MERIT support access] requester revoke failed", { code });
      return NextResponse.json({ error: "Unable to revoke support access" }, { status: 500 });
    }
  };
}
