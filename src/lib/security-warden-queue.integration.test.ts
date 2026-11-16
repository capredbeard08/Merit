import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  claimSecurityHunterRun,
  completeSecurityHunterRun,
  enqueueSecurityHunterRun,
  heartbeatSecurityHunterRun,
  HUNTER_LEASE_MS,
  MAX_CONCURRENT_HUNTER_RUNS,
} from "./security-warden-queue";

const prisma = new PrismaClient();

async function createRuns(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const run = await enqueueSecurityHunterRun({
      hunterType: "CODE",
      engine: "integration-" + randomUUID(),
      engineVersion: "test",
      scopeMetadata: {
        repository: "capredbeard08/Merit",
        commitSha: "abc123",
        rawCode: "must-not-be-stored",
        token: "must-not-be-stored",
      },
    });
    ids.push(run.id);
  }
  return ids;
}

async function cleanup(ids: string[]) {
  await prisma.securityEvent.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.securityHunterRun.deleteMany({ where: { id: { in: ids } } });
}

test("hunter queue enforces a global active-lease cap and strips unsafe scope metadata", async () => {
  const ids = await createRuns(8);
  try {
    const firstClaims = await Promise.all(
      Array.from({ length: 8 }, () => claimSecurityHunterRun()),
    );
    const claims = firstClaims.filter((item): item is NonNullable<typeof item> => item !== null);
    let active = await prisma.securityHunterRun.count({
      where: { id: { in: ids }, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
    });

    for (let i = 0; active < MAX_CONCURRENT_HUNTER_RUNS && i < 8; i += 1) {
      const claim = await claimSecurityHunterRun();
      if (claim) claims.push(claim);
      active = await prisma.securityHunterRun.count({
        where: { id: { in: ids }, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
      });
    }

    assert.ok(active <= MAX_CONCURRENT_HUNTER_RUNS, "active leases must never exceed the global cap");
    assert.equal(active, MAX_CONCURRENT_HUNTER_RUNS, "available work should fill the bounded worker slots");

    const stored = await prisma.securityHunterRun.findFirstOrThrow({ where: { id: ids[0] } });
    const scope = stored.scopeMetadata as Record<string, unknown>;
    assert.equal(scope.repository, "capredbeard08/Merit");
    assert.equal(scope.rawCode, undefined);
    assert.equal(scope.token, undefined);

    for (const claim of claims) {
      assert.equal(await heartbeatSecurityHunterRun(claim.run.id, "wrong-token"), false);
      assert.equal(await heartbeatSecurityHunterRun(claim.run.id, claim.leaseToken), true);
      assert.equal(await completeSecurityHunterRun(claim.run.id, claim.leaseToken, "Static checks completed."), true);
    }
  } finally {
    await cleanup(ids);
  }
});

test("expired worker leases can be reclaimed, but stale tokens cannot mutate the run", async () => {
  const ids = await createRuns(1);
  try {
    const start = new Date();
    const first = await claimSecurityHunterRun(start);
    assert.ok(first);
    assert.equal(first.run.id, ids[0]);

    const reclaimedAt = new Date(start.getTime() + HUNTER_LEASE_MS + 1);
    assert.equal(await heartbeatSecurityHunterRun(first.run.id, first.leaseToken, reclaimedAt), false);

    const second = await claimSecurityHunterRun(reclaimedAt);
    assert.ok(second);
    assert.equal(second.run.id, first.run.id);
    assert.notEqual(second.leaseToken, first.leaseToken);
    assert.equal(second.run.attemptCount, 2);
    assert.equal(await completeSecurityHunterRun(first.run.id, first.leaseToken, "stale worker", reclaimedAt), false);
    assert.equal(await completeSecurityHunterRun(second.run.id, second.leaseToken, "reclaimed worker completed", reclaimedAt), true);

    const saved = await prisma.securityHunterRun.findUniqueOrThrow({ where: { id: first.run.id } });
    assert.equal(saved.status, "COMPLETED");
    assert.equal(saved.leaseTokenHash, null);
    assert.equal(saved.leaseExpiresAt, null);
  } finally {
    await cleanup(ids);
  }
});
