import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";

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
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json({ error: "Invitation email does not match signed-in account" }, { status: 403 });
  }

  const accepted = await prisma.$transaction(async (tx) => {
    // Claim the invitation once, even when two requests race to accept it.
    const claim = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claim.count !== 1) return false;

    await tx.member.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.user.id } },
      create: {
        workspaceId: invitation.workspaceId,
        userId: session.user.id,
        email: session.user.email,
        role: invitation.role,
      },
      update: {},
    });
    return true;
  });

  if (!accepted) return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  return NextResponse.json({ accepted: true, workspaceId: invitation.workspaceId });
}
