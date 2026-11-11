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

/**
 * Run a tenant mutation while holding a shared lock on the actor's membership.
 * A concurrent membership deletion or role change must wait until the write
 * commits. Keep callbacks database-only; never hold this transaction across
 * network or object-storage calls.
 */
export async function withWorkspacePermission<T>(
  workspaceId: string,
  userId: string,
  permission: Permission,
  operation: (tx: import("@prisma/client").Prisma.TransactionClient, membership: { id: string; role: Role }) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; role: string }>>`
      SELECT "id", "role"
      FROM "Member"
      WHERE "workspaceId" = ${workspaceId} AND "userId" = ${userId}
      FOR SHARE
    `;
    const membership = rows[0];
    if (!membership) throw new Error("FORBIDDEN");

    const role = membership.role.toLowerCase() as Role;
    if (!can(role, permission)) throw new Error("FORBIDDEN");

    return operation(tx, { id: membership.id, role });
  });
}


export type WorkspaceMembership = { workspaceId: string };

/** Resolve a requested workspace only from memberships loaded for the authenticated user. */
export function resolveWorkspaceMembership<T extends WorkspaceMembership>(
  memberships: readonly T[],
  requestedWorkspaceId?: string | null,
): T | null {
  if (memberships.length === 0) return null;
  if (!requestedWorkspaceId) return memberships[0] ?? null;
  return memberships.find((membership) => membership.workspaceId === requestedWorkspaceId) ?? null;
}
