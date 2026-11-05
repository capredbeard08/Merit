import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { auth } from "./better-auth";
import { GET as getFeedback } from "../app/api/feedback/route";
import { PATCH as patchFeedback } from "../app/api/feedback/[id]/route";
import { DELETE as deleteBranch } from "../app/api/branches/[id]/route";
import { GET as getFile } from "../app/api/files/[id]/route";
import { DELETE as deleteWebhook } from "../app/api/integrations/webhook/route";

after(async () => {
  await prisma.$disconnect();
});

test("tenant API routes reject cross-workspace reads and mutations", async () => {
  const suffix = randomUUID();
  const workspaceA = await prisma.workspace.create({ data: { name: "Route Tenant A " + suffix } });
  const workspaceB = await prisma.workspace.create({ data: { name: "Route Tenant B " + suffix } });
  const user = await prisma.user.create({
    data: { id: "route-user-" + suffix, name: "Route Test", email: "route-" + suffix + "@example.test" },
  });

  try {
    await prisma.member.create({
      data: { workspaceId: workspaceA.id, userId: user.id, email: user.email, role: "OWNER" },
    });

    const branchA = await prisma.branch.create({
      data: { workspaceId: workspaceA.id, name: "Branch A" },
    });
    const branchB = await prisma.branch.create({
      data: { workspaceId: workspaceB.id, name: "Branch B" },
    });

    const customerA = await prisma.customer.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, externalId: "route-customer-a-" + suffix },
    });
    const customerB = await prisma.customer.create({
      data: { workspaceId: workspaceB.id, branchId: branchB.id, externalId: "route-customer-b-" + suffix },
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

    const fileB = await prisma.fileAsset.create({
      data: {
        workspaceId: workspaceB.id,
        uploadedById: user.id,
        originalName: "private.pdf",
        pathname: "private/route-test-" + suffix + ".pdf",
        contentType: "application/pdf",
        sizeBytes: 0,
        status: "AVAILABLE",
      },
    });
    const webhookB = await prisma.webhookEndpoint.create({
      data: {
        workspaceId: workspaceB.id,
        branchId: branchB.id,
        label: "Private webhook",
        secretHash: "route-test-secret-hash",
      },
    });

    const sessionMock = mock.method(auth.api, "getSession", async () => ({
      user: { id: user.id, email: user.email },
    } as never));

    try {
      const scopedFeedbackResponse = await getFeedback(
        new Request("https://merit.example.test/api/feedback?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedFeedbackResponse.status, 200);
      const scopedFeedback = await scopedFeedbackResponse.json();
      assert.deepEqual(scopedFeedback.feedback.map((item: { id: string }) => item.id), [feedbackA.id]);

      const foreignFeedbackResponse = await getFeedback(
        new Request("https://merit.example.test/api/feedback?workspaceId=" + encodeURIComponent(workspaceB.id)),
      );
      assert.equal(foreignFeedbackResponse.status, 403);

      const foreignFeedbackMutation = await patchFeedback(
        new Request("https://merit.example.test/api/feedback/" + feedbackB.id, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspaceA.id, status: "RESOLVED" }),
        }),
        { params: Promise.resolve({ id: feedbackB.id }) },
      );
      assert.equal(foreignFeedbackMutation.status, 404);

      const foreignBranchMutation = await deleteBranch(
        new Request("https://merit.example.test/api/branches/" + branchB.id + "?workspaceId=" + encodeURIComponent(workspaceA.id), {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: branchB.id }) },
      );
      assert.equal(foreignBranchMutation.status, 404);

      const foreignFileRead = await getFile(
        new Request("https://merit.example.test/api/files/" + fileB.id),
        { params: Promise.resolve({ id: fileB.id }) },
      );
      assert.equal(foreignFileRead.status, 404);

      const foreignWebhookRevocation = await deleteWebhook(
        new Request("https://merit.example.test/api/integrations/webhook?id=" + webhookB.id, {
          method: "DELETE",
        }),
      );
      assert.equal(foreignWebhookRevocation.status, 404);

      const unchangedFeedback = await prisma.feedback.findUnique({ where: { id: feedbackB.id } });
      const unchangedBranch = await prisma.branch.findUnique({ where: { id: branchB.id } });
      const unchangedFile = await prisma.fileAsset.findUnique({ where: { id: fileB.id } });
      const unchangedWebhook = await prisma.webhookEndpoint.findUnique({ where: { id: webhookB.id } });

      assert.equal(unchangedFeedback?.status, "PENDING");
      assert.equal(unchangedBranch?.archivedAt, null);
      assert.equal(unchangedFile?.deletedAt, null);
      assert.equal(unchangedWebhook?.revokedAt, null);
    } finally {
      sessionMock.mock.restore();
    }
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
