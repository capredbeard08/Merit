import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  branchId: z.string().min(1),
  label: z.string().trim().max(80).optional(),
});
const reviewSchema = z.string().trim().url().max(2048).nullable();

async function membershipFor(request: Request, workspaceId: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { ok: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, session, membership };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const access = await membershipFor(request, workspaceId);
  if (!access.ok) return access.response;
  if (!can(access.membership.role.toLowerCase() as Role, "feedback:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [codes, feedback, count, ratings, branches] = await Promise.all([
    prisma.guestQrCode.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, publicId: true, branchId: true, label: true, status: true,
        createdAt: true, lastUsedAt: true,
        branch: { select: { name: true, archivedAt: true, googleReviewUrl: true } },
        _count: { select: { feedback: true } },
      },
    }),
    prisma.guestFeedback.findMany({
      where: { workspaceId },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: {
        id: true, rating: true, message: true, submittedAt: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.guestFeedback.count({ where: { workspaceId } }),
    prisma.guestFeedback.groupBy({ by: ["rating"], where: { workspaceId }, _count: { _all: true } }),
    prisma.branch.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, googleReviewUrl: true } }),
  ]);
  return NextResponse.json({
    codes: codes.map((code) => ({
      ...code,
      publicUrl: new URL("/g/" + code.publicId, url.origin).toString(),
    })),
    feedback,
    branches,
    summary: { count, averageRating: count ? ratings.reduce((total, item) => total + ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[item.rating] * item._count._all), 0) / count : null },
  });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid branch and try again." }, { status: 400 });
  const access = await membershipFor(request, parsed.data.workspaceId);
  if ("response" in access) return access.response;
  if (!can(access.membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "You don't have permission to manage guest QR codes." }, { status: 403 });
  }

  const branch = await prisma.branch.findFirst({
    where: { id: parsed.data.branchId, workspaceId: parsed.data.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!branch) return NextResponse.json({ error: "Active branch not found." }, { status: 404 });

  const code = await prisma.guestQrCode.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      branchId: branch.id,
      publicId: randomBytes(24).toString("base64url"),
      label: parsed.data.label || null,
    },
    select: { id: true, publicId: true, branchId: true, label: true, status: true, createdAt: true },
  });
  await writeAuditLog({
    workspaceId: parsed.data.workspaceId,
    actorUserId: access.session.user.id,
    action: "GUEST_QR_CREATED",
    targetType: "GUEST_QR",
    targetId: code.id,
    metadata: { branchId: branch.id, status: code.status },
    request,
  });
  const origin = new URL(request.url).origin;
  return NextResponse.json({ code: { ...code, publicUrl: new URL("/g/" + code.publicId, origin).toString() } }, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const schema = z.object({ workspaceId: z.string().min(1), branchId: z.string().min(1), googleReviewUrl: reviewSchema });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid HTTPS review URL or leave it blank." }, { status: 400 });
  if (parsed.data.googleReviewUrl) {
    try {
      const url = new URL(parsed.data.googleReviewUrl);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || !(host === "google.com" || host.endsWith(".google.com") || host === "g.page" || host === "maps.app.goo.gl")) {
        return NextResponse.json({ error: "Use a Google review link beginning with https://." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Enter a valid Google review URL." }, { status: 400 });
    }
  }
  const access = await membershipFor(request, parsed.data.workspaceId);
  if ("response" in access) return access.response;
  if (!can(access.membership.role.toLowerCase() as Role, "branches:manage")) {
    return NextResponse.json({ error: "You don't have permission to manage review destinations." }, { status: 403 });
  }
  const changed = await prisma.branch.updateMany({
    where: { id: parsed.data.branchId, workspaceId: parsed.data.workspaceId, archivedAt: null },
    data: { googleReviewUrl: parsed.data.googleReviewUrl },
  });
  if (changed.count !== 1) return NextResponse.json({ error: "Active branch not found." }, { status: 404 });
  await writeAuditLog({
    workspaceId: parsed.data.workspaceId,
    actorUserId: access.session.user.id,
    action: "GUEST_REVIEW_DESTINATION_UPDATED",
    targetType: "BRANCH",
    targetId: parsed.data.branchId,
    metadata: { configured: Boolean(parsed.data.googleReviewUrl) },
    request,
  });
  return NextResponse.json({ saved: true });
}
