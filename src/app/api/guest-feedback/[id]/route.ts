import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED", "REVOKED"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid QR status." }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.guestQrCode.findFirst({
    where: { id, workspaceId: parsed.data.workspaceId },
    select: { id: true, status: true, branchId: true },
  });
  if (!existing) return NextResponse.json({ error: "QR code not found." }, { status: 404 });
  if (existing.status === "REVOKED" && parsed.data.status !== "REVOKED") {
    return NextResponse.json({ error: "Revoked QR codes cannot be reactivated. Generate a new code instead." }, { status: 409 });
  }

  const updated = await prisma.guestQrCode.updateMany({
    where: { id, workspaceId: parsed.data.workspaceId },
    data: { status: parsed.data.status },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "QR code not found." }, { status: 404 });

  await writeAuditLog({
    workspaceId: parsed.data.workspaceId,
    actorUserId: session.user.id,
    action: "GUEST_QR_STATUS_CHANGED",
    targetType: "GUEST_QR",
    targetId: id,
    metadata: { previousStatus: existing.status, newStatus: parsed.data.status, branchId: existing.branchId },
    request,
  });
  return NextResponse.json({ id, status: parsed.data.status });
}
