import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const enabled = process.env.MERIT_SECURITY_DB_TESTS === "1";
const prisma = new PrismaClient();

test("database security transitions are single-winner and workspace-scoped", { skip: !enabled }, async (t) => {
  const suffix = randomUUID();
  const workspace = await prisma.workspace.create({ data: { name: "MERIT security test " + suffix } });
  const user = await prisma.user.create({
    data: { id: "security-test-" + suffix, name: "Security Test", email: suffix + "@example.invalid" },
  });

  t.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  // A stale restore must not resurrect a later deletion generation.
  const file = await prisma.fileAsset.create({
    data: {
      workspaceId: workspace.id,
      uploadedById: user.id,
      originalName: "evidence.pdf",
      pathname: "security-test/" + suffix + "/evidence.pdf",
      contentType: "application/pdf",
      sizeBytes: 128,
      status: "AVAILABLE",
    },
  });
  const firstDeletedAt = new Date();
  const deleted = await prisma.fileAsset.updateMany({
    where: { id: file.id, workspaceId: workspace.id, status: "AVAILABLE", deletedAt: null },
    data: { status: "DELETED", deletedAt: firstDeletedAt, deletedById: user.id, priorStatus: "AVAILABLE" },
  });
  assert.equal(deleted.count, 1);

  const restored = await prisma.fileAsset.updateMany({
    where: { id: file.id, workspaceId: workspace.id, status: "DELETED", deletedAt: firstDeletedAt, priorStatus: "AVAILABLE" },
    data: { status: "AVAILABLE", deletedAt: null, deletedById: null, priorStatus: null },
  });
  assert.equal(restored.count, 1);

  const secondDeletedAt = new Date(firstDeletedAt.getTime() + 1);
  await prisma.fileAsset.updateMany({
    where: { id: file.id, workspaceId: workspace.id, status: "AVAILABLE", deletedAt: null },
    data: { status: "DELETED", deletedAt: secondDeletedAt, deletedById: user.id, priorStatus: "AVAILABLE" },
  });
  const staleRestore = await prisma.fileAsset.updateMany({
    where: { id: file.id, workspaceId: workspace.id, status: "DELETED", deletedAt: firstDeletedAt, priorStatus: "AVAILABLE" },
    data: { status: "AVAILABLE", deletedAt: null, deletedById: null, priorStatus: null },
  });
  assert.equal(staleRestore.count, 0);

  // A bearer invitation can be claimed by only one concurrent acceptance.
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId: workspace.id,
      email: user.email,
      role: "VIEWER",
      tokenHash: "hash-" + suffix,
      expiresAt: new Date(Date.now() + 60_000),
      invitedByUserId: user.id,
    },
  });
  const accept = () => prisma.$transaction(async (tx) => {
    const claim = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claim.count !== 1) return false;
    await tx.member.create({
      data: { workspaceId: workspace.id, userId: user.id, email: user.email, role: "VIEWER" },
    });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const acceptances = await Promise.allSettled([accept(), accept()]);
  const acceptedCount = acceptances.filter((result) => result.status === "fulfilled" && result.value === true).length;
  assert.equal(acceptedCount, 1);
  for (const result of acceptances) {
    if (result.status === "rejected") {
      const code = (result.reason as { code?: string })?.code;
      assert.ok(code === "P2034" || code === "P2002", "only serialization or uniqueness conflicts are acceptable");
    }
  }
  assert.equal(await prisma.member.count({ where: { workspaceId: workspace.id, userId: user.id } }), 1);

  // Concurrent archival attempts have one winner; archived branches cannot be treated as active.
  const branch = await prisma.branch.create({ data: { workspaceId: workspace.id, name: "Branch " + suffix } });
  const archive = () => prisma.$transaction(async (tx) => tx.branch.updateMany({
    where: { id: branch.id, workspaceId: workspace.id, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: user.id },
  }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const archives = await Promise.allSettled([archive(), archive()]);
  const archiveWins = archives.filter((result) => result.status === "fulfilled" && result.value.count === 1).length;
  assert.equal(archiveWins, 1);
  for (const result of archives) {
    if (result.status === "rejected") {
      const code = (result.reason as { code?: string })?.code;
      assert.equal(code, "P2034");
    }
  }
  assert.equal(await prisma.branch.count({ where: { id: branch.id, workspaceId: workspace.id, archivedAt: null } }), 0);

  // An opt-out cancels queued and claimed-but-not-yet-dispatched follow-ups.
  const customer = await prisma.customer.create({
    data: { workspaceId: workspace.id, branchId: branch.id, externalId: "customer-" + suffix, email: "customer@example.invalid" },
  });
  const event = await prisma.serviceEvent.create({
    data: { workspaceId: workspace.id, branchId: branch.id, customerId: customer.id, completedAt: new Date() },
  });
  const feedback = await prisma.feedback.create({
    data: { workspaceId: workspace.id, branchId: branch.id, customerId: customer.id, serviceEventId: event.id },
  });
  const followUp = await prisma.followUp.create({
    data: { workspaceId: workspace.id, feedbackId: feedback.id, status: "PROCESSING", scheduledAt: new Date() },
  });
  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { optedOutAt: new Date() } }),
    prisma.feedback.update({ where: { id: feedback.id }, data: { status: "OPTED_OUT" } }),
    prisma.followUp.updateMany({
      where: { feedbackId: feedback.id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "CANCELLED", processingAt: null },
    }),
  ]);
  const optedOutFollowUp = await prisma.followUp.findUnique({ where: { id: followUp.id } });
  assert.equal(optedOutFollowUp?.status, "CANCELLED");
});
