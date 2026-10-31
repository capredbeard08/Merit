import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Tenant-scoped database boundary.
 *
 * Configure DATABASE_RUNTIME_URL with a dedicated PostgreSQL role that:
 * - does not own application tables;
 * - is not superuser and has no BYPASSRLS;
 * - has only required application DML privileges.
 *
 * Do not point this variable at the migration/owner connection.
 */
const runtimeUrl = process.env.DATABASE_RUNTIME_URL;

const runtimeGlobal = globalThis as unknown as { tenantPrisma?: PrismaClient };

function getTenantPrisma(): PrismaClient {
  if (!runtimeUrl) {
    throw new Error("DATABASE_RUNTIME_URL is required for tenant-scoped database access");
  }

  if (!runtimeGlobal.tenantPrisma) {
    runtimeGlobal.tenantPrisma = new PrismaClient({
      datasources: { db: { url: runtimeUrl } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return runtimeGlobal.tenantPrisma;
}

/**
 * Resolve membership using the existing authentication connection, then set
 * transaction-local context on the restricted runtime connection. All tenant
 * queries in the callback MUST use tx, never the global prisma client.
 *
 * This boundary is preparatory until RLS policies are installed and tested.
 */
export async function withTenantDb<T>(
  userId: string,
  workspaceId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!userId || !workspaceId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const client = getTenantPrisma();

  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
    return callback(tx);
  });
}
