import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, roles, type Role } from "@/lib/domain";

const schema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  role: z.enum(roles).default("viewer"),
});

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json({
    invitation,
    acceptUrl: appUrl + "/invite/" + token,
    warning: "Invitation delivery is not wired yet; the accept URL is returned for development.",
  }, { status: 201 });
}
