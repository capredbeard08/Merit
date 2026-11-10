import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

after(async () => { await prisma.$disconnect(); });

async function expectTenantGuardFailure(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /cross-workspace|workspace reassignment|constraint/i);
    return true;
  });
}

test("database guards reject cross-workspace relations and tenant reassignment", async () => {
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
      data: { workspaceId: workspaceA.id, branchId: branchA.id, customerId: customerA.id, serviceEventId: eventA.id },
    });
    const feedbackB = await prisma.feedback.create({
      data: { workspaceId: workspaceB.id, branchId: branchB.id, customerId: customerB.id, serviceEventId: eventB.id },
    });
    const fileAsset = await prisma.fileAsset.create({
      data: {
        workspaceId: workspaceA.id,
        uploadedById: "tenant-test-user",
        originalName: "evidence.pdf",
        pathname: "tenant-guard-" + suffix + ".pdf",
        contentType: "application/pdf",
        sizeBytes: 0,
        status: "QUARANTINED",
      },
    });
    const securityEvent = await prisma.securityEvent.create({
      data: { workspaceId: workspaceA.id, type: "AUTHZ_DENIED", severity: "HIGH", metadata: { test: true } },
    });

    await expectTenantGuardFailure(() => prisma.customer.create({
      data: { workspaceId: workspaceA.id, branchId: branchB.id, externalId: "bad-customer-" + suffix },
    }));
    await expectTenantGuardFailure(() => prisma.serviceEvent.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, customerId: customerB.id, completedAt: new Date() },
    }));
    await expectTenantGuardFailure(() => prisma.feedback.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, customerId: customerA.id, serviceEventId: eventB.id },
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
      where: { id: customerA.id }, data: { branchId: branchB.id },
    }));
    await expectTenantGuardFailure(() => prisma.feedback.update({
      where: { id: feedbackA.id }, data: { branchId: branchB.id },
    }));
    await expectTenantGuardFailure(() => prisma.customer.updateMany({
      where: { id: customerA.id }, data: { branchId: branchB.id },
    }));

    // Parent reassignment must not invalidate child records created under the original tenant.
    await expectTenantGuardFailure(() => prisma.branch.update({
      where: { id: branchA.id }, data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.customer.update({
      where: { id: customerA.id }, data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.serviceEvent.update({
      where: { id: eventA.id }, data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.feedback.update({
      where: { id: feedbackA.id }, data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.fileAsset.update({
      where: { id: fileAsset.id }, data: { workspaceId: workspaceB.id },
    }));
    await expectTenantGuardFailure(() => prisma.securityEvent.update({
      where: { id: securityEvent.id }, data: { workspaceId: workspaceB.id },
    }));
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
  }
});
