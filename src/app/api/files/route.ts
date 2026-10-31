import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";
  if (!workspaceId || workspaceId.length > 128) return NextResponse.json({ error: "Invalid workspaceId" }, { status: 400 });
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!member || !can(member.role.toLowerCase() as Role, "feedback:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (includeDeleted && !can(member.role.toLowerCase() as Role, "files:recover")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const files = await prisma.fileAsset.findMany({
    where: { workspaceId, ...(includeDeleted ? { deletedAt: { not: null } } : { deletedAt: null, status: { not: "DELETED" } }) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, originalName: true, contentType: true, sizeBytes: true, status: true, createdAt: true, uploadedById: true, deletedAt: true },
  });
  return NextResponse.json({ files });
}
