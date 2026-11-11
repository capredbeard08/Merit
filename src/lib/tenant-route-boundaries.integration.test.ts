import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "./prisma";
import { auth } from "./better-auth";
import { GET as getFeedback } from "../app/api/feedback/route";
import { GET as getBranches } from "../app/api/branches/route";
import { GET as getFiles } from "../app/api/files/route";
import { GET as getWorkspace } from "../app/api/workspaces/route";
import { PATCH as patchWorkspace } from "../app/api/workspaces/[workspaceId]/route";
import { GET as getWorkspaceSupportAccess } from "../app/api/workspaces/[workspaceId]/support-access/route";
import { PATCH as patchFeedback } from "../app/api/feedback/[id]/route";
import { DELETE as deleteBranch } from "../app/api/branches/[id]/route";
import { GET as getFile, DELETE as deleteFile } from "../app/api/files/[id]/route";
import { POST as restoreFile } from "../app/api/files/[id]/restore/route";
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
    // The workspace security-events endpoint reads the audit projection written
    // alongside each SecurityEvent by recordSecurityEvent().
    await prisma.auditLog.create({
      data: { workspaceId: workspaceA.id, actorUserId: user.id, action: "SECURITY:ROUTE_TEST_A", targetType: "SECURITY_EVENT", targetId: feedbackA.id, metadata: { severity: "HIGH" } },
    });
    await prisma.auditLog.create({
      data: { workspaceId: workspaceB.id, actorUserId: user.id, action: "SECURITY:ROUTE_TEST_B", targetType: "SECURITY_EVENT", targetId: feedbackB.id, metadata: { severity: "CRITICAL" } },
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

    const fileA = await prisma.fileAsset.create({
      data: {
        workspaceId: workspaceA.id,
        uploadedById: user.id,
        originalName: "workspace-a.pdf",
        pathname: "private/route-test-a-" + suffix + ".pdf",
        contentType: "application/pdf",
        sizeBytes: 0,
        status: "AVAILABLE",
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
      const scopedBranchesResponse = await getBranches(
        new Request("https://merit.example.test/api/branches?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedBranchesResponse.status, 200);
      const scopedBranches = await scopedBranchesResponse.json();
      assert.deepEqual(scopedBranches.branches.map((item: { id: string }) => item.id), [branchA.id]);
      assert.equal((await getBranches(
        new Request("https://merit.example.test/api/branches?workspaceId=" + encodeURIComponent(workspaceB.id)),
      )).status, 403);

      const scopedFilesResponse = await getFiles(
        new Request("https://merit.example.test/api/files?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(scopedFilesResponse.status, 200);
      const scopedFiles = await scopedFilesResponse.json();
      assert.deepEqual(scopedFiles.files.map((item: { id: string }) => item.id), [fileA.id]);
      assert.equal((await getFiles(
        new Request("https://merit.example.test/api/files?workspaceId=" + encodeURIComponent(workspaceB.id)),
      )).status, 404);

      const selectedWorkspaceResponse = await getWorkspace(
        new Request("https://merit.example.test/api/workspaces?workspaceId=" + encodeURIComponent(workspaceA.id)),
      );
      assert.equal(selectedWorkspaceResponse.status, 200);
      const selectedWorkspace = await selectedWorkspaceResponse.json();
      assert.equal(selectedWorkspace.workspace.id, workspaceA.id);
      assert.equal((await getWorkspace(
        new Request("https://merit.example.test/api/workspaces?workspaceId=" + encodeURIComponent(workspaceB.id)),
      )).status, 404);

      const foreignWorkspaceRename = await patchWorkspace(
        new Request("https://merit.example.test/api/workspaces/" + workspaceB.id, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Attacker renamed workspace" }),
        }),
        { params: Promise.resolve({ workspaceId: workspaceB.id }) },
      );
      assert.equal(foreignWorkspaceRename.status, 403);
      const unchangedWorkspaceB = await prisma.workspace.findUnique({ where: { id: workspaceB.id } });
      assert.equal(unchangedWorkspaceB?.name, "Route Tenant B " + suffix);

      const foreignSupportRequests = await getWorkspaceSupportAccess(
        new Request("https://merit.example.test/api/workspaces/" + workspaceB.id + "/support-access"),
        { params: Promise.resolve({ workspaceId: workspaceB.id }) },
      );
      assert.equal(foreignSupportRequests.status, 403);

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

      const softDeleteResponse = await deleteFile(
        new Request("https://merit.example.test/api/files/" + fileA.id, { method: "DELETE" }),
        { params: Promise.resolve({ id: fileA.id }) },
      );
      assert.equal(softDeleteResponse.status, 204);
      const softDeletedFile = await prisma.fileAsset.findUnique({ where: { id: fileA.id } });
      assert.ok(softDeletedFile?.deletedAt);
      assert.equal(softDeletedFile?.status, "DELETED");
      assert.equal(softDeletedFile?.pathname, fileA.pathname);
      assert.equal((await getFile(
        new Request("https://merit.example.test/api/files/" + fileA.id),
        { params: Promise.resolve({ id: fileA.id }) },
      )).status, 404);

      const restoreResponse = await restoreFile(
        new Request("https://merit.example.test/api/files/" + fileA.id + "/restore", { method: "POST" }),
        { params: Promise.resolve({ id: fileA.id }) },
      );
      assert.equal(restoreResponse.status, 200);
      const restoredFile = await prisma.fileAsset.findUnique({ where: { id: fileA.id } });
      assert.equal(restoredFile?.deletedAt, null);
      assert.equal(restoredFile?.status, "AVAILABLE");
      assert.equal(restoredFile?.pathname, fileA.pathname);

      const legalHoldFile = await prisma.fileAsset.create({
        data: {
          workspaceId: workspaceA.id,
          uploadedById: user.id,
          originalName: "legal-hold.txt",
          pathname: "private/legal-hold-" + suffix + ".txt",
          contentType: "text/plain",
          sizeBytes: 1,
          status: "AVAILABLE",
          legalHoldAt: new Date(),
          legalHoldById: user.id,
          legalHoldReason: "Retention regression test",
        },
      });
      const blockedLegalHoldDelete = await deleteFile(
        new Request("https://merit.example.test/api/files/" + legalHoldFile.id, { method: "DELETE" }),
        { params: Promise.resolve({ id: legalHoldFile.id }) },
      );
      assert.equal(blockedLegalHoldDelete.status, 423);
      const retainedLegalHoldFile = await prisma.fileAsset.findUnique({ where: { id: legalHoldFile.id } });
      assert.equal(retainedLegalHoldFile?.deletedAt, null);
      assert.equal(retainedLegalHoldFile?.status, "AVAILABLE");

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
      assert.deepEqual(scopedSecurityEvents.events.map((item: { targetId: string | null }) => item.targetId), [feedbackA.id]);
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
    // Release the test-only hold after asserting that the application cannot
    // delete the held file. The database trigger correctly blocks workspace
    // cascades while any child file remains under legal hold.
    await prisma.fileAsset.updateMany({
      where: { workspaceId: workspaceA.id, legalHoldAt: { not: null } },
      data: { legalHoldAt: null, legalHoldById: null, legalHoldReason: null },
    });
    await prisma.securityEvent.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
