import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

const CONFIRMATION = "PERMANENTLY ERASE";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "Explicit permanent-erasure confirmation is required" }, { status: 400 });
  }

  const { id } = await context.params;
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, pathname: true, status: true, deletedAt: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.user.id } },
  });
  if (!member || !can(member.role.toLowerCase() as Role, "files:erase")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!file.deletedAt || (file.status !== "DELETED" && file.status !== "ERASURE_PENDING")) {
    return NextResponse.json({ error: "Only soft-deleted files can be permanently erased" }, { status: 409 });
  }
  const retentionSetting = process.env.FILE_RECOVERY_RETENTION_DAYS;
  const retentionDays = retentionSetting ? Number(retentionSetting) : NaN;
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    return NextResponse.json({ error: "Permanent erasure is disabled until the file-recovery retention policy is configured." }, { status: 503 });
  }
  const eligibleAt = new Date(file.deletedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  if (Date.now() < eligibleAt.getTime()) {
    return NextResponse.json({ error: "The file is still within its recovery period.", eligibleAt: eligibleAt.toISOString() }, { status: 409 });
  }

  // Atomically claim the transition out of the recoverable state. A concurrent
  // restore can win this compare-and-set, but it cannot race past this claim.
  if (file.status === "DELETED") {
    const claim = await prisma.fileAsset.updateMany({
      where: { id: file.id, workspaceId: file.workspaceId, status: "DELETED", deletedAt: file.deletedAt },
      data: { status: "ERASURE_PENDING" },
    });
    if (claim.count !== 1) {
      return NextResponse.json({ error: "File recovery state changed; refresh and try again." }, { status: 409 });
    }
  }

  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: file.status === "ERASURE_PENDING" ? "FILE_ERASURE_RETRY_STARTED" : "FILE_ERASURE_STARTED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { priorStatus: file.status },
    request,
  });

  // Keep the database tombstone if storage deletion fails so the operation can be retried.
  try {
    await del(file.pathname);
  } catch {
    return NextResponse.json({ error: "Storage erasure could not be confirmed; the file remains blocked for retry." }, { status: 503 });
  }

  await prisma.fileAsset.delete({ where: { id: file.id } });
  await writeAuditLog({
    workspaceId: file.workspaceId,
    actorUserId: session.user.id,
    action: "FILE_PERMANENTLY_ERASED",
    targetType: "FILE_ASSET",
    targetId: file.id,
    metadata: { storageDeletionRequested: true },
    request,
  });
  return NextResponse.json({ erased: true });
}
