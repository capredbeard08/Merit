import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, roles, type Role } from "@/lib/domain";
import { withWorkspacePermission } from "@/lib/workspace-access";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  role: z.enum(roles).default("viewer"),
});

type MembershipResult =
  | { ok: false; response: Response }
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>; membership: NonNullable<Awaited<ReturnType<typeof prisma.member.findUnique>>> };

async function getMembership(request: Request, workspaceId: string): Promise<MembershipResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session, membership };
}

export async function GET(request: Request): Promise<Response> {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const result = await getMembership(request, workspaceId);
  if (!result.ok) return result.response;
  if (!can(result.membership.role.toLowerCase() as Role, "members:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.member.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, createdAt: true, user: { select: { name: true, image: true } } },
  });
  return NextResponse.json({ members });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid member payload" }, { status: 400 });

  const result = await getMembership(request, parsed.data.workspaceId);
  if (!result.ok) return result.response;
  if (!can(result.membership.role.toLowerCase() as Role, "members:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (parsed.data.role === "owner") {
    return NextResponse.json({ error: "Owner membership cannot be assigned through this endpoint" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ error: "User does not have a MERIT account yet; invite flow comes next." }, { status: 404 });
  }

  const existing = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: user.id } },
  });
  if (existing) return NextResponse.json({ error: "User is already a member" }, { status: 409 });

  try {
    const member = await withWorkspacePermission(
      parsed.data.workspaceId,
      result.session.user.id,
      "members:manage",
      async (tx) => {
        const created = await tx.member.create({
          data: { workspaceId: parsed.data.workspaceId, userId: user.id, email: user.email, role: parsed.data.role.toUpperCase() as never },
          select: { id: true, email: true, role: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            actorUserId: result.session.user.id,
            action: "MEMBER_CREATED",
            targetType: "MEMBER",
            targetId: created.id,
            metadata: { role: parsed.data.role },
            ipAddress: request.headers.get("x-real-ip")?.slice(0, 64) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        return created;
      },
    );
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }
    throw error;
  }
}
