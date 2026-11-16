import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { recordSecurityEvent } from "@/lib/security-warden";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Invitation token required" }, { status: 400 });

  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hash(token) } });
  if (!invitation) return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  if (invitation.acceptedAt) {
    await recordSecurityEvent({
      type: "INVITATION_REPLAY",
      workspaceId: invitation.workspaceId,
      actorUserId: session.user.id,
      targetId: invitation.id,
      metadata: { reason: "already_accepted" },
      request,
    });
    return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json({ error: "Invitation email does not match signed-in account" }, { status: 403 });
  }

  const existing = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.user.id } },
  });
  if (existing) {
    const claimed = await prisma.invitation.updateMany({
      where: { id: invitation.id, tokenHash: hash(token), acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await recordSecurityEvent({
        type: "INVITATION_REPLAY",
        workspaceId: invitation.workspaceId,
        actorUserId: session.user.id,
        targetId: invitation.id,
        metadata: { reason: "concurrent_acceptance" },
        request,
      });
      return NextResponse.json({ error: "Invitation has already been accepted or expired" }, { status: 409 });
    }
    return NextResponse.json({ accepted: true, workspaceId: invitation.workspaceId });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Compare-and-set the invitation before creating membership. This makes
      // the bearer token single-use even when two acceptance requests race.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, tokenHash: hash(token), acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("INVITATION_ALREADY_CLAIMED");

      await tx.member.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
          email: session.user.email,
          role: invitation.role,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_CLAIMED") {
      await recordSecurityEvent({
        type: "INVITATION_REPLAY",
        workspaceId: invitation.workspaceId,
        actorUserId: session.user.id,
        targetId: invitation.id,
        metadata: { reason: "concurrent_acceptance" },
        request,
      });
      return NextResponse.json({ error: "Invitation has already been accepted or expired" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This account is already a workspace member" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Invitation state changed during acceptance; retry once." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ accepted: true, workspaceId: invitation.workspaceId });
}
