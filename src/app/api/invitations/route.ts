import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, roles, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

const schema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  role: z.enum(roles).default("viewer"),
});

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation payload" }, { status: 400 });
  if (parsed.data.role === "owner") return NextResponse.json({ error: "Owner invitations are not allowed" }, { status: 400 });

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!membership || !can(membership.role.toLowerCase() as Role, "members:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existingUser) {
    const existingMember = await prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: existingUser.id } },
    });
    if (existingMember) return NextResponse.json({ error: "User is already a member" }, { status: 409 });
  }

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      email: parsed.data.email,
      role: parsed.data.role.toUpperCase() as never,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 72),
      invitedByUserId: session.user.id,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    return NextResponse.json({ error: "Invitation delivery is unavailable because the application URL is not configured." }, { status: 503 });
  }
  const acceptUrl = appUrl.replace(/\/$/, "") + "/invite/" + token;
  try {
    await sendEmail({
      to: invitation.email,
      subject: "You're invited to join a MERIT workspace",
      html: `<div style="font-family:Arial,sans-serif;color:#173b2f;line-height:1.6"><h2>You're invited to MERIT</h2><p>You have been invited to join a business workspace as <strong>${escapeHtml(parsed.data.role)}</strong>.</p><p><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:12px 18px;background:#173b2f;color:#fff;text-decoration:none;border-radius:8px">Accept invitation</a></p><p>This invitation expires in 72 hours. If you were not expecting it, you can ignore this email.</p></div>`,
      idempotencyKey: "merit-invitation-" + invitation.id,
    });
  } catch {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    return NextResponse.json({ error: "Invitation email could not be delivered. No active invitation was left behind." }, { status: 502 });
  }

  await writeAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: session.user.id, action: "INVITATION_CREATED", targetType: "INVITATION", targetId: invitation.id, metadata: { role: parsed.data.role, delivery: "email" }, request });
  return NextResponse.json({ invitation, delivered: true }, { status: 201 });
}
