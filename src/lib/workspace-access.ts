import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission, type Role } from "@/lib/domain";

export async function requireMembership(workspaceId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });

  if (!membership) throw new Error("FORBIDDEN");
  return { session, membership };
}

export function requirePermission(role: string, permission: Permission) {
  const normalized = role.toLowerCase() as Role;
  if (!can(normalized, permission)) throw new Error("FORBIDDEN");
  return normalized;
}


export type WorkspaceMembership = { workspaceId: string };

/** Resolve a requested workspace only from memberships already loaded for the authenticated user. */
export function resolveWorkspaceMembership<T extends WorkspaceMembership>(
  memberships: readonly T[],
  requestedWorkspaceId?: string | null,
): T | null {
  if (memberships.length === 0) return null;
  if (!requestedWorkspaceId) return memberships[0] ?? null;
  return memberships.find((membership) => membership.workspaceId === requestedWorkspaceId) ?? null;
}
