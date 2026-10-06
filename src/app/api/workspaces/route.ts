import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid workspace name" },
      { status: 400 },
    );
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      members: {
        create: {
          userId: session.user.id,
          email: session.user.email.toLowerCase(),
          role: "OWNER",
        },
      },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        select: {
          role: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        role: workspace.members[0]?.role ?? "OWNER",
      },
    },
    { status: 201 },
  );
}
