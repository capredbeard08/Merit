import type { Prisma } from "@prisma/client";

/**
 * Disabled by design on Prisma Postgres.
 *
 * Prisma Postgres currently does not support custom PostgreSQL roles. A second
 * generated connection string would still have full database privileges, so
 * it cannot be used as a restricted runtime credential or as an RLS boundary.
 *
 * Do not add DATABASE_RUNTIME_URL or wire this helper into business-data
 * routes. Tenant authorization must be enforced by authenticated membership
 * checks and explicit workspace-scoped Prisma predicates until MERIT moves to
 * a database provider that supports a dedicated non-owner runtime role.
 */
export async function withTenantDb<T>(
  _userId: string,
  _workspaceId: string,
  _callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  throw new Error("TENANT_DB_ROLE_UNSUPPORTED: Prisma Postgres does not support restricted runtime roles");
}
