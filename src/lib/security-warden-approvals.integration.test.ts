import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  approveFounderSecurityAction,
  consumeFounderSecurityApproval,
  requestFounderSecurityApproval,
} from "./security-warden-approvals";

const prisma = new PrismaClient();
const ARTIFACT_HASH = "a".repeat(64);

async function createFixture(createdAt = new Date()) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      id: "warden-founder-" + suffix,
      name: "Warden Founder Test",
      email: "warden-founder-" + suffix + "@example.invalid",
      twoFactorEnabled: true,
    },
  });
  const session = await prisma.session.create({
    data: {
      id: "warden-session-" + suffix,
      token: "warden-session-token-" + suffix,
      userId: user.id,
      createdAt,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await prisma.platformAccess.create({
    data: { userId: user.id, role: "FOUNDER_SUPER_ADMIN" },
  });
  const incident = await prisma.securityIncident.create({
    data: {
      severity: "HIGH",
      confidence: 90,
      source: "integration-test",
      summary: "Approval workflow integration test",
    },
  });
  const artifact = await prisma.securityArtifact.create({
    data: {
      incidentId: incident.id,
      originalObjectRef: "private/quarantine/" + suffix,
      sha256: ARTIFACT_HASH,
      sizeBytes: BigInt(12),
      storageState: "QUARANTINED",
    },
  });
  return { user, session, incident, artifact };
}

async function cleanup(f: Awaited<ReturnType<typeof createFixture>>) {
  const actions = await prisma.securityAction.findMany({
    where: { incidentId: f.incident.id }, select: { id: true },
  });
  const approvals = await prisma.securityApproval.findMany({
    where: { incidentId: f.incident.id }, select: { id: true },
  });
  const targetIds = [...actions.map((item) => item.id), ...approvals.map((item) => item.id)];
  await prisma.securityEvent.deleteMany({
    where: { OR: [{ actorUserId: f.user.id }, { targetId: { in: targetIds } }] },
  });
  await prisma.securityAction.deleteMany({ where: { incidentId: f.incident.id } });
  await prisma.securityApproval.deleteMany({ where: { incidentId: f.incident.id } });
  await prisma.securityArtifact.deleteMany({ where: { id: f.artifact.id } });
  await prisma.securityIncident.deleteMany({ where: { id: f.incident.id } });
  await prisma.platformAccess.deleteMany({ where: { userId: f.user.id } });
  await prisma.session.deleteMany({ where: { id: f.session.id } });
  await prisma.user.deleteMany({ where: { id: f.user.id } });
}

test("Founder approval is exact-scope, fresh-session gated, atomic, and single-use", async () => {
  const now = new Date();
  const f = await createFixture(new Date(now.getTime() - 60_000));
  let approvalId: string | undefined;
  try {
    const actionScope = {
      operation: "DISPOSE",
      artifactId: f.artifact.id,
      artifactHash: ARTIFACT_HASH,
      preserveRecoveryCopy: true,
    };
    const requested = await requestFounderSecurityApproval({
      incidentId: f.incident.id,
      artifactId: f.artifact.id,
      artifactHash: ARTIFACT_HASH,
      actionType: "DISPOSE",
      actionScope,
      requestedById: "security-warden",
      reason: "Integration test of explicit Founder approval",
    }, now);
    approvalId = requested.approval.id;
    assert.equal(requested.approval.status, "PENDING");
    assert.equal(requested.approval.expiresAt.getTime(), now.getTime() + 10 * 60 * 1000);

    await approveFounderSecurityAction({
      approvalId,
      actorUserId: f.user.id,
      sessionId: f.session.id,
      decision: "APPROVE",
    }, now);
    assert.equal((await prisma.securityApproval.findUniqueOrThrow({ where: { id: approvalId } })).status, "APPROVED");

    const consume = () => consumeFounderSecurityApproval({
      approvalId: approvalId!,
      approvalNonce: requested.approvalNonce,
      artifactId: f.artifact.id,
      artifactHash: ARTIFACT_HASH,
      actionType: "DISPOSE",
      actionScope,
      actorUserId: "red-squid-worker",
    }, now);
    const outcomes = await Promise.allSettled([consume(), consume()]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1,
      "only one concurrent worker may consume the approval");
    assert.equal(await prisma.securityAction.count({ where: { approvalId } }), 1);
    assert.equal((await prisma.securityApproval.findUniqueOrThrow({ where: { id: approvalId } })).status, "CONSUMED");
    await assert.rejects(consume(), /APPROVAL_NOT_USABLE/);
  } finally {
    await cleanup(f);
  }
});

test("approval decision rejects a stale Founder session", async () => {
  const now = new Date();
  const f = await createFixture(new Date(now.getTime() - 11 * 60 * 1000));
  try {
    const requested = await requestFounderSecurityApproval({
      incidentId: f.incident.id,
      artifactId: f.artifact.id,
      artifactHash: ARTIFACT_HASH,
      actionType: "SAFE_UNPACK",
      actionScope: { operation: "SAFE_UNPACK", artifactId: f.artifact.id, artifactHash: ARTIFACT_HASH },
      requestedById: "security-warden",
      reason: "Stale-session test",
    }, now);
    await assert.rejects(
      approveFounderSecurityAction({
        approvalId: requested.approval.id,
        actorUserId: f.user.id,
        sessionId: f.session.id,
        decision: "APPROVE",
      }, now),
      /FRESH_SESSION_REQUIRED/,
    );
    assert.equal((await prisma.securityApproval.findUniqueOrThrow({ where: { id: requested.approval.id } })).status, "PENDING");
  } finally {
    await cleanup(f);
  }
});

test("approval request rejects an artifact hash mismatch", async () => {
  const f = await createFixture();
  try {
    await assert.rejects(
      requestFounderSecurityApproval({
        incidentId: f.incident.id,
        artifactId: f.artifact.id,
        artifactHash: "b".repeat(64),
        actionType: "DEOBFUSCATE",
        actionScope: { operation: "DEOBFUSCATE", artifactId: f.artifact.id },
        requestedById: "security-warden",
        reason: "Hash mismatch test",
      }),
      /ARTIFACT_SCOPE_MISMATCH/,
    );
  } finally {
    await cleanup(f);
  }
});
