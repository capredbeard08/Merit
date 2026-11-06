import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "./prisma";
import { auth } from "./better-auth";
import { GET as getFeedback } from "../app/api/feedback/route";
import { PATCH as patchFeedback } from "../app/api/feedback/[id]/route";
import { DELETE as deleteBranch } from "../app/api/branches/[id]/route";
import { GET as getFile } from "../app/api/files/[id]/route";
import { DELETE as deleteWebhook } from "../app/api/integrations/webhook/route";
import { GET as getMembers, POST as createMember } from "../app/api/members/route";
import { POST as createInvitation } from "../app/api/invitations/route";
import { POST as acceptInvitation } from "../app/api/invitations/accept/route";
import { GET as getInsights } from "../app/api/insights/route";
import { POST as generateInsight } from "../app/api/insights/generate/route";
import { GET as getReplies } from "../app/api/replies/route";
import { GET as getSecurityEvents } from "../app/api/security/events/route";

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

    const replyA = await prisma.feedbackReply.create({
      data: { workspaceId: workspaceA.id, feedbackId: feedbackA.id, rating: "FIVE", message: "Excellent service A" },
    });
    const replyB = await prisma.feedbackReply.create({
      data: { workspaceId: workspaceB.id, feedbackId: feedbackB.id, rating: "ONE", message: "Private reply B" },
    });
    const insightA = await prisma.insight.create({
      data: { workspaceId: workspaceA.id, kind: "FEEDBACK_SUMMARY", title: "Insight A", summary: "Workspace A only", evidence: { responseCount: 1 } },
    });
    const insightB = await prisma.insight.create({
      data: { workspaceId: workspaceB.id, kind: "FEEDBACK_SUMMARY", title: "Insight B", summary: "Private workspace B", evidence: { responseCount: 1 } },
    });
    const securityEventA = await prisma.securityEvent.create({
      data: { workspaceId: workspaceA.id, actorUserId: user.id, type: "ROUTE_TEST_A", severity: "HIGH", targetId: feedbackA.id },
    });
    const securityEventB = await prisma.securityEvent.create({
      data: { workspaceId: workspaceB.id, actorUserId: user.id, type: "ROUTE_TEST_B", severity: "CRITICAL", targetId: feedbackB.id },
    });
    const invitationToken = "route-invitation-token-" + suffix;
    const invitationB = await prisma.invitation.create({
      data: {
        workspaceId: workspaceB.id,
        email: "someone-else-" + suffix + "@example.test",
        role: "VIEWER",
        tokenHash: createHash("sha256").update(invitationToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        invitedByUserId: user.id,
      },
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

      const scopedInsightsResponse = await getInsights(
        new Request("https://merit.example.test/api/insights?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedInsightsResponse.status, 200);
      const scopedInsights = await scopedInsightsResponse.json();
      assert.deepEqual(scopedInsights.insights.map((item: { id: string }) => item.id), [insightA.id]);

      const foreignInsightsResponse = await getInsights(
        new Request("https://merit.example.test/api/insights?workspaceId=" + encodeURIComponent(workspaceB.id)),
      );
      assert.equal(foreignInsightsResponse.status, 404);

      const foreignInsightGeneration = await generateInsight(
        new Request("https://merit.example.test/api/insights/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspaceB.id }),
        }),
      );
      assert.equal(foreignInsightGeneration.status, 404);

      const scopedRepliesResponse = await getReplies(
        new Request("https://merit.example.test/api/replies?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedRepliesResponse.status, 200);
      const scopedReplies = await scopedRepliesResponse.json();
      assert.deepEqual(scopedReplies.replies.map((item: { id: string }) => item.id), [replyA.id]);
      assert.equal(scopedReplies.replies[0].feedback.id, feedbackA.id);

      const foreignRepliesResponse = await getReplies(
        new Request("https://merit.example.test/api/replies?workspaceId=" + encodeURIComponent(workspaceB.id)),
      );
      assert.equal(foreignRepliesResponse.status, 404);

      const scopedSecurityEventsResponse = await getSecurityEvents(
        new Request("https://merit.example.test/api/security/events?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedSecurityEventsResponse.status, 200);
      const scopedSecurityEvents = await scopedSecurityEventsResponse.json();
      assert.deepEqual(scopedSecurityEvents.events.map((item: { id: string }) => item.id), [securityEventA.id]);
      assert.equal(scopedSecurityEvents.counts.HIGH, 1);
      assert.equal(scopedSecurityEvents.counts.CRITICAL, 0);

      const foreignSecurityEventsResponse = await getSecurityEvents(
        new Request("https://merit.example.test/api/security/events?workspaceId=" + encodeURIComponent(workspaceB.id)),
      );
      assert.equal(foreignSecurityEventsResponse.status, 403);

      const scopedMembersResponse = await getMembers(
        new Request("https://merit.example.test/api/members?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedMembersResponse.status, 200);
      const scopedMembers = await scopedMembersResponse.json();
      assert.deepEqual(scopedMembers.members.map((item: { email: string }) => item.email), [user.email]);

      const foreignMembersResponse = await getMembers(
        new Request("https://merit.example.test/api/members?workspaceId=" + encodeURIComponent(workspaceB.id)),
      );
      assert.equal(foreignMembersResponse.status, 403);

      const foreignMemberCreation = await createMember(
        new Request("https://merit.example.test/api/members", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspaceB.id, email: "new-" + suffix + "@example.test", role: "viewer" }),
        }),
      );
      assert.equal(foreignMemberCreation.status, 403);

      const foreignInvitationCreation = await createInvitation(
        new Request("https://merit.example.test/api/invitations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspaceB.id, email: "invite-" + suffix + "@example.test", role: "viewer" }),
        }),
      );
      assert.equal(foreignInvitationCreation.status, 403);

      const mismatchedInvitationAcceptance = await acceptInvitation(
        new Request("https://merit.example.test/api/invitations/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: invitationToken }),
        }),
      );
      assert.equal(mismatchedInvitationAcceptance.status, 403);
      const unchangedInvitation = await prisma.invitation.findUnique({ where: { id: invitationB.id } });
      assert.equal(unchangedInvitation?.acceptedAt, null);

      const unchangedFeedback = await prisma.feedback.findUnique({ where: { id: feedbackB.id } });
      const unchangedBranch = await prisma.branch.findUnique({ where: { id: branchB.id } });
      const unchangedFile = await prisma.fileAsset.findUnique({ where: { id: fileB.id } });
      const unchangedWebhook = await prisma.webhookEndpoint.findUnique({ where: { id: webhookB.id } });
      const unchangedReply = await prisma.feedbackReply.findUnique({ where: { id: replyB.id } });
      const unchangedInsight = await prisma.insight.findUnique({ where: { id: insightB.id } });
      const unchangedSecurityEvent = await prisma.securityEvent.findUnique({ where: { id: securityEventB.id } });

      assert.equal(unchangedFeedback?.status, "PENDING");
      assert.equal(unchangedBranch?.archivedAt, null);
      assert.equal(unchangedFile?.deletedAt, null);
      assert.equal(unchangedWebhook?.revokedAt, null);
      assert.equal(unchangedReply?.message, "Private reply B");
      assert.equal(unchangedInsight?.summary, "Private workspace B");
      assert.equal(unchangedSecurityEvent?.type, "ROUTE_TEST_B");
    } finally {
      sessionMock.mock.restore();
    }
  } finally {
    await prisma.securityEvent.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
