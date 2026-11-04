import { createHash, randomBytes } from "node:crypto";
import { Prisma, type SecurityHunterRun, type SecurityHunterType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MAX_CONCURRENT_HUNTER_RUNS = 3;
export const MAX_HUNTER_ATTEMPTS = 3;
export const HUNTER_LEASE_MS = 90_000;

const SAFE_SCOPE_KEYS = new Set(["repository", "commitSha", "artifactId", "source", "ruleSet", "branch"]);

function sanitizeHunterScope(input: Record<string, unknown> = {}): Prisma.InputJsonObject {
  const safe: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_SCOPE_KEYS.has(key) || Object.keys(safe).length >= 8) continue;
    if (typeof value === "string") safe[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
  }
  return safe;
}

function hashLeaseToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Enqueue metadata only; this function never starts a scanner or executes an artifact. */
export async function enqueueSecurityHunterRun(input: {
  incidentId?: string | null;
  hunterType: SecurityHunterType;
  engine: string;
  engineVersion?: string | null;
  scopeMetadata?: Record<string, unknown>;
}): Promise<SecurityHunterRun> {
  const engine = input.engine.trim();
  if (!engine || engine.length > 100) throw new Error("INVALID_HUNTER_ENGINE");
  const engineVersion = input.engineVersion?.trim() || null;
  if (engineVersion && engineVersion.length > 100) throw new Error("INVALID_HUNTER_ENGINE_VERSION");

  return prisma.$transaction(async (tx) => {
    const run = await tx.securityHunterRun.create({
      data: {
        incidentId: input.incidentId ?? null,
        hunterType: input.hunterType,
        engine,
        engineVersion,
        scopeMetadata: sanitizeHunterScope(input.scopeMetadata),
        status: "QUEUED",
      },
    });
    await tx.securityEvent.create({
      data: {
        type: "SECURITY_HUNTER_QUEUED",
        severity: "LOW",
        targetId: run.id,
        metadata: { hunterType: run.hunterType, engine: run.engine },
      },
    });
    return run;
  });
}

/**
 * Claim one queued/expired run with a short lease. Serializable counting caps
 * all active leases at three across workers; a conflict is a harmless no-claim.
 * The raw lease token is returned once and only its hash is persisted.
 */
export async function claimSecurityHunterRun(now = new Date()): Promise<{
  run: SecurityHunterRun;
  leaseToken: string;
} | null> {
  const leaseToken = randomBytes(32).toString("hex");
  const leaseTokenHash = hashLeaseToken(leaseToken);

  try {
    return await prisma.$transaction(async (tx) => {
      const exhausted = await tx.securityHunterRun.findMany({
        where: {
          status: "RUNNING",
          attemptCount: { gte: MAX_HUNTER_ATTEMPTS },
          leaseExpiresAt: { lte: now },
        },
        select: { id: true },
      });
      for (const stale of exhausted) {
        const expired = await tx.securityHunterRun.updateMany({
          where: { id: stale.id, status: "RUNNING", leaseExpiresAt: { lte: now } },
          data: {
            status: "FAILED",
            summary: "Worker lease expired after the maximum retry count.",
            finishedAt: now,
            leaseTokenHash: null,
            leaseExpiresAt: null,
          },
        });
        if (expired.count === 1) {
          await tx.securityEvent.create({
            data: {
              type: "SECURITY_HUNTER_FAILED",
              severity: "MEDIUM",
              targetId: stale.id,
              metadata: { reason: "MAXIMUM_LEASE_ATTEMPTS_EXCEEDED" },
            },
          });
        }
      }

      const activeCount = await tx.securityHunterRun.count({
        where: { status: "RUNNING", leaseExpiresAt: { gt: now } },
      });
      if (activeCount >= MAX_CONCURRENT_HUNTER_RUNS) return null;

      const candidate = await tx.securityHunterRun.findFirst({
        where: {
          attemptCount: { lt: MAX_HUNTER_ATTEMPTS },
          OR: [
            { status: "QUEUED" },
            {
              status: "RUNNING",
              OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (!candidate) return null;

      const claimed = await tx.securityHunterRun.updateMany({
        where: {
          id: candidate.id,
          attemptCount: candidate.attemptCount,
          OR: [
            { status: "QUEUED" },
            {
              status: "RUNNING",
              OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
            },
          ],
        },
        data: {
          status: "RUNNING",
          attemptCount: { increment: 1 },
          leaseTokenHash,
          leaseExpiresAt: new Date(now.getTime() + HUNTER_LEASE_MS),
          lastHeartbeatAt: now,
          startedAt: candidate.startedAt ?? now,
          finishedAt: null,
        },
      });
      if (claimed.count !== 1) return null;

      const run = await tx.securityHunterRun.findUniqueOrThrow({ where: { id: candidate.id } });
      await tx.securityEvent.create({
        data: {
          type: "SECURITY_HUNTER_STARTED",
          severity: "LOW",
          targetId: run.id,
          metadata: { hunterType: run.hunterType, engine: run.engine, attempt: run.attemptCount },
        },
      });
      return { run, leaseToken };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isSerializationConflict(error)) return null;
    throw error;
  }
}

/** Extend a lease only while the caller still owns a live lease. */
export async function heartbeatSecurityHunterRun(
  runId: string,
  leaseToken: string,
  now = new Date(),
): Promise<boolean> {
  const updated = await prisma.securityHunterRun.updateMany({
    where: {
      id: runId,
      status: "RUNNING",
      leaseTokenHash: hashLeaseToken(leaseToken),
      leaseExpiresAt: { gt: now },
    },
    data: {
      lastHeartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + HUNTER_LEASE_MS),
    },
  });
  return updated.count === 1;
}

async function settleSecurityHunterRun(
  runId: string,
  leaseToken: string,
  status: "COMPLETED" | "INCONCLUSIVE" | "FAILED",
  summary: string,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.securityHunterRun.updateMany({
      where: {
        id: runId,
        status: "RUNNING",
        leaseTokenHash: hashLeaseToken(leaseToken),
        leaseExpiresAt: { gt: now },
      },
      data: {
        status,
        summary: summary.trim().slice(0, 2000),
        finishedAt: now,
        leaseTokenHash: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count !== 1) return false;

    await tx.securityEvent.create({
      data: {
        type: status === "FAILED" ? "SECURITY_HUNTER_FAILED" : "SECURITY_HUNTER_COMPLETED",
        severity: status === "FAILED" ? "MEDIUM" : "LOW",
        targetId: runId,
        metadata: { status },
      },
    });
    return true;
  });
}

export function completeSecurityHunterRun(
  runId: string,
  leaseToken: string,
  summary: string,
  now = new Date(),
): Promise<boolean> {
  return settleSecurityHunterRun(runId, leaseToken, "COMPLETED", summary, now);
}

export function markSecurityHunterRunInconclusive(
  runId: string,
  leaseToken: string,
  summary: string,
  now = new Date(),
): Promise<boolean> {
  return settleSecurityHunterRun(runId, leaseToken, "INCONCLUSIVE", summary, now);
}

export function failSecurityHunterRun(
  runId: string,
  leaseToken: string,
  summary: string,
  now = new Date(),
): Promise<boolean> {
  return settleSecurityHunterRun(runId, leaseToken, "FAILED", summary, now);
}
