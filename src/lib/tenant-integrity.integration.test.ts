import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { withWorkspacePermission } from "./workspace-access";

const concurrentPrisma = new PrismaClient();
after(async () => {
  await concurrentPrisma.$disconnect();
  await prisma.$disconnect();
});

async function expectTenantGuardFailure(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /cross-workspace|constraint/i);
    return true;
  });
}

test("database guards reject cross-workspace tenant relations on create and update", async () => {
  const suffix = randomUUID();
  const workspaceA = await prisma.workspace.create({ data: { name: "Tenant A " + suffix } });
  const workspaceB = await prisma.workspace.create({ data: { name: "Tenant B " + suffix } });

  try {
    const branchA = await prisma.branch.create({ data: { workspaceId: workspaceA.id, name: "Branch A" } });
    const branchB = await prisma.branch.create({ data: { workspaceId: workspaceB.id, name: "Branch B" } });

    const customerA = await prisma.customer.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, externalId: "customer-a-" + suffix },
    });
    const customerB = await prisma.customer.create({
      data: { workspaceId: workspaceB.id, branchId: branchB.id, externalId: "customer-b-" + suffix },
    });

    const eventA = await prisma.serviceEvent.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, customerId: customerA.id, completedAt: new Date() },
    });
    const eventB = await prisma.serviceEvent.create({
      data: { workspaceId: workspaceB.id, branchId: branchB.id, customerId: customerB.id, completedAt: new Date() },
    });

    const feedbackA = await prisma.feedback.create({
      data: {
        workspaceId: workspaceA.id,
        branchId: branchA.id,
        customerId: customerA.id,
        serviceEventId: eventA.id,
      },
    });
    const feedbackB = await prisma.feedback.create({
      data: {
        workspaceId: workspaceB.id,
        branchId: branchB.id,
        customerId: customerB.id,
        serviceEventId: eventB.id,
      },
    });

    await expectTenantGuardFailure(() => prisma.customer.create({
      data: { workspaceId: workspaceA.id, branchId: branchB.id, externalId: "bad-customer-" + suffix },
    }));
    await expectTenantGuardFailure(() => prisma.serviceEvent.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, customerId: customerB.id, completedAt: new Date() },
    }));
    await expectTenantGuardFailure(() => prisma.feedback.create({
      data: {
        workspaceId: workspaceA.id,
        branchId: branchA.id,
        customerId: customerA.id,
        serviceEventId: eventB.id,
      },
    }));
    await expectTenantGuardFailure(() => prisma.followUp.create({
      data: { workspaceId: workspaceA.id, feedbackId: feedbackB.id, scheduledAt: new Date() },
    }));
    await expectTenantGuardFailure(() => prisma.feedbackReply.create({
      data: { workspaceId: workspaceA.id, feedbackId: feedbackB.id, message: "Should be rejected" },
    }));
    await expectTenantGuardFailure(() => prisma.webhookEndpoint.create({
      data: { workspaceId: workspaceA.id, branchId: branchB.id, label: "Invalid endpoint", secretHash: "test-hash" },
    }));

    await expectTenantGuardFailure(() => prisma.customer.update({
      where: { id: customerA.id },
      data: { branchId: branchB.id },
    }));
    await expectTenantGuardFailure(() => prisma.serviceEvent.update({
      where: { id: eventA.id },
      data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.feedback.update({
      where: { id: feedbackA.id },
      data: { branchId: branchB.id },
    }));
    await expectTenantGuardFailure(() => prisma.customer.updateMany({
      where: { id: customerA.id },
      data: { branchId: branchB.id },
    }));
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
  }
});


test("membership lock prevents revocation racing a protected tenant mutation", async () => {
  const suffix = randomUUID();
  const workspace = await prisma.workspace.create({ data: { name: "Lock Test " + suffix } });
  const user = await prisma.user.create({
    data: { id: "lock-user-" + suffix, name: "Lock Test", email: "lock-" + suffix + "@example.test" },
  });
  const membership = await prisma.member.create({
    data: { workspaceId: workspace.id, userId: user.id, email: user.email, role: "OWNER" },
  });

  let notifyLockAcquired!: () => void;
  let releaseTransaction!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { notifyLockAcquired = resolve; });
  const holdTransaction = new Promise<void>((resolve) => { releaseTransaction = resolve; });

  const protectedMutation = withWorkspacePermission(
    workspace.id,
    user.id,
    "branches:manage",
    async () => {
      notifyLockAcquired();
      await holdTransaction;
      return "authorized";
    },
  );

  let deletionFinished = false;
  let deletion: Promise<unknown> | undefined;
  try {
    await lockAcquired;
    deletion = concurrentPrisma.member.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    }).then((result) => {
      deletionFinished = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(deletionFinished, false, "membership deletion must wait while the authorization lock is held");

    releaseTransaction();
    assert.equal(await protectedMutation, "authorized");
    await deletion;
    assert.equal(deletionFinished, true);
  } finally {
    releaseTransaction();
    if (deletion) await deletion.catch(() => undefined);
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }

  assert.equal(membership.workspaceId, workspace.id);
});
