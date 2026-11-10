import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { withWorkspacePermission } from "@/lib/workspace-access";
import { sanitizeSecurityMetadata } from "@/lib/security-warden";

const schema = z.object({
  workspaceId: z.string().min(1).max(128),
  status: z.enum(["CONTACTED", "CLICKED", "REPLIED", "RESOLVED", "OPTED_OUT"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback update" }, { status: 400 });

  const feedback = await prisma.feedback.findFirst({
    where: { id, workspaceId: parsed.data.workspaceId },
    select: { id: true, status: true, customerId: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const now = new Date();
  const timestamps = {
    CONTACTED: { sentAt: now },
    CLICKED: { clickedAt: now },
    REPLIED: { repliedAt: now },
    RESOLVED: { resolvedAt: now },
    OPTED_OUT: {},
  } as const;

  try {
    const updated = await withWorkspacePermission(
      parsed.data.workspaceId,
      session.user.id,
      "feedback:write",
      async (tx) => {
        // Keep the tenant predicate on the write itself; the earlier lookup is
        // only for a useful not-found response and the audit's prior state.
        const claim = await tx.feedback.updateMany({
          where: { id, workspaceId: parsed.data.workspaceId },
          data: { status: parsed.data.status, ...timestamps[parsed.data.status] },
        });
        if (claim.count !== 1) return null;

        if (parsed.data.status === "OPTED_OUT") {
          await tx.customer.updateMany({
            where: { id: feedback.customerId, workspaceId: parsed.data.workspaceId },
            data: { optedOutAt: now },
          });
          await tx.followUp.updateMany({
            where: {
              workspaceId: parsed.data.workspaceId,
              status: { in: ["QUEUED", "PROCESSING"] },
              feedback: { customerId: feedback.customerId },
            },
            data: { status: "CANCELLED", processingAt: null },
          });
        } else {
          await tx.followUp.updateMany({
            where: { feedbackId: id, workspaceId: parsed.data.workspaceId, status: { in: ["QUEUED", "PROCESSING"] } },
            data: { status: "CANCELLED", processingAt: null },
          });
        }

        await tx.auditLog.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            actorUserId: session.user.id,
            action: "FEEDBACK_STATUS_CHANGED",
            targetType: "FEEDBACK",
            targetId: id,
            metadata: sanitizeSecurityMetadata({ from: feedback.status, to: parsed.data.status }),
            ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });

        return tx.feedback.findFirst({
          where: { id, workspaceId: parsed.data.workspaceId },
          select: { id: true, status: true, sentAt: true, clickedAt: true, repliedAt: true, resolvedAt: true },
        });
      },
    );

    if (!updated) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    return NextResponse.json({ feedback: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
