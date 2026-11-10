import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { auth } from "./better-auth";
import { DELETE as archiveBranch } from "../app/api/branches/[id]/route";
import { POST as restoreBranch } from "../app/api/branches/[id]/restore/route";
import { GET as getFile, DELETE as softDeleteFile } from "../app/api/files/[id]/route";
import { GET as listWorkspaceFiles } from "../app/api/files/route";
import { GET as accessDeletedFile } from "../app/api/files/[id]/evidence/route";
import { POST as manageFileLegalHold } from "../app/api/files/[id]/legal-hold/route";
import { POST as restoreFile } from "../app/api/files/[id]/restore/route";
import { POST as acceptInvitation } from "../app/api/invitations/accept/route";
import { POST as serviceCompletedWebhook } from "../app/api/webhooks/service-completed/route";
import { POST as createWebhookEndpoint, DELETE as revokeWebhookEndpoint } from "../app/api/integrations/webhook/route";
import { POST as processFollowUps } from "../app/api/follow-ups/process/route";
import { GET as openOptOutLink, POST as confirmOptOut } from "../app/api/feedback/[id]/optout/route";
import { GET as openFeedbackClick } from "../app/api/feedback/[id]/click/route";
import { PATCH as updateFeedbackStatus } from "../app/api/feedback/[id]/route";
import { createFeedbackToken } from "./feedback-token";
import { POST as provisionWorkspace } from "../app/api/workspaces/route";
import { GET as getFeedbackNotes, POST as createFeedbackNote } from "../app/api/feedback/[id]/notes/route";

const enabled = process.env.MERIT_SECURITY_DB_TESTS === "1";
const prisma = new PrismaClient();

async function createCredentialAccount(userId: string, email: string, suffix: string) {
  const password = "MeritSecurityTest!123";
  await prisma.account.create({
    data: {
      id: "account-" + suffix,
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(password),
    },
  });
  const signedIn = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = signedIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie.length > 0, "Better Auth sign-in must issue a signed session cookie");
  return new Headers({ cookie });
}

test("database security transitions are single-winner and workspace-scoped", { skip: !enabled }, async (t) => {
  const suffix = randomUUID();
  const workspace = await prisma.workspace.create({ data: { name: "MERIT security test " + suffix } });
  const user = await prisma.user.create({
    data: { id: "security-test-" + suffix, name: "Security Test", email: suffix + "@example.invalid" },
  });
  let inviteeId: string | null = null;
  let outsiderId: string | null = null;
  let provisioningUserId: string | null = null;
  let provisionedWorkspaceId: string | null = null;

  t.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, ...(provisionedWorkspaceId ? [provisionedWorkspaceId] : [])] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, ...(inviteeId ? [inviteeId] : []), ...(outsiderId ? [outsiderId] : []), ...(provisioningUserId ? [provisioningUserId] : [])] } } });
    await prisma.$disconnect();
  });

  // Create a real Better Auth session so each request exercises the
  // cookie-backed CSRF origin check, not merely unauthenticated login behavior.
  const sessionHeaders = await createCredentialAccount(user.id, user.email, "owner-" + suffix);

  const authOriginRequest = (host: string, origin: string) => auth.handler(new Request(
    "https://" + host + "/api/auth/update-user",
    {
      method: "POST",
      headers: {
        origin,
        "sec-fetch-site": origin === "https://" + host ? "same-origin" : "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        cookie: sessionHeaders.get("cookie")!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Origin check " + suffix }),
    },
  ));
  const canonicalOriginResponse = await authOriginRequest("merit-olive.vercel.app", "https://merit-olive.vercel.app");
  assert.notEqual(canonicalOriginResponse.status, 403, "the canonical MERIT origin must pass Better Auth's cookie-backed origin check");
  const previewOriginResponse = await authOriginRequest("merit-preview-check-capredbeard08.vercel.app", "https://merit-preview-check-capredbeard08.vercel.app");
  assert.notEqual(previewOriginResponse.status, 403, "MERIT-owned generated preview origins must pass Better Auth's cookie-backed origin check");
  // Keep the request addressed to MERIT's canonical host while simulating
  // a browser page hosted by an unrelated origin. The session cookie forces
  // Better Auth's CSRF middleware to enforce the trusted-origin boundary.
  const untrustedOriginResponse = await authOriginRequest("merit-olive.vercel.app", "https://attacker.example");
  assert.equal(untrustedOriginResponse.status, 403, "untrusted browser origins must be rejected by Better Auth");
  // Concurrent first-time workspace setup must serialize on the user row:
  // one request creates the workspace, and the other returns that same workspace.
  const provisioningUser = await prisma.user.create({
    data: { id: "workspace-provision-" + suffix, name: "Provisioning Test", email: "workspace-provision-" + suffix + "@example.invalid" },
  });
  provisioningUserId = provisioningUser.id;
  const provisioningHeaders = await createCredentialAccount(provisioningUser.id, provisioningUser.email, "provision-" + suffix);
  const provisionRequest = (name: string) => provisionWorkspace(new Request("http://localhost/api/workspaces", {
    method: "POST",
    headers: { cookie: provisioningHeaders.get("cookie")!, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  const provisioned = await Promise.all([provisionRequest("Workspace A " + suffix), provisionRequest("Workspace B " + suffix)]);
  const provisionBodies = await Promise.all(provisioned.map((response) => response.json() as Promise<{ workspace: { id: string } }>));
  assert.deepEqual(provisioned.map((response) => response.status).sort(), [200, 201]);
  assert.equal(provisionBodies[0].workspace.id, provisionBodies[1].workspace.id);
  provisionedWorkspaceId = provisionBodies[0].workspace.id;
  assert.equal(await prisma.member.count({ where: { userId: provisioningUser.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { workspaceId: provisionedWorkspaceId, action: "WORKSPACE_CREATED" } }), 1);


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
  // Elevate the fixture to OWNER for the authenticated management-route tests below.
  await prisma.member.update({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    data: { role: "OWNER" },
  });

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
    data: { workspaceId: workspace.id, branchId: branch.id, customerId: customer.id, externalId: "event-" + suffix, completedAt: new Date() },
  });
  await assert.rejects(
    prisma.serviceEvent.create({
      data: { workspaceId: workspace.id, branchId: branch.id, customerId: customer.id, externalId: "event-" + suffix, completedAt: new Date() },
    }),
    (error: unknown) => (error as { code?: string })?.code === "P2002",
    "a repeated external event id must be rejected by the database uniqueness constraint",
  );

  const feedback = await prisma.feedback.create({
    data: { workspaceId: workspace.id, branchId: branch.id, customerId: customer.id, serviceEventId: event.id },
  });
  const followUp = await prisma.followUp.create({
    data: { workspaceId: workspace.id, feedbackId: feedback.id, status: "QUEUED", scheduledAt: new Date() },
  });
  const claimFollowUp = () => prisma.followUp.updateMany({
    where: { id: followUp.id, status: "QUEUED" },
    data: { status: "PROCESSING", processingAt: new Date() },
  });
  const claims = await Promise.all([claimFollowUp(), claimFollowUp()]);
  assert.equal(claims.filter((claim) => claim.count === 1).length, 1);

  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { optedOutAt: new Date() } }),
    prisma.feedback.update({ where: { id: feedback.id }, data: { status: "OPTED_OUT" } }),
    prisma.followUp.updateMany({
      where: { feedbackId: feedback.id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "CANCELLED", processingAt: null },
    }),
  ]);
  assert.equal(await prisma.branch.count({ where: { id: branch.id, workspaceId: workspace.id, archivedAt: null } }), 0);
  const lateFinalize = await prisma.followUp.updateMany({
    where: { id: followUp.id, status: "PROCESSING" },
    data: { status: "SENT", sentAt: new Date(), processingAt: null },
  });
  assert.equal(lateFinalize.count, 0, "a late provider response must not overwrite an opt-out cancellation");
  const optedOutFollowUp = await prisma.followUp.findUnique({ where: { id: followUp.id } });
  assert.equal(optedOutFollowUp?.status, "CANCELLED");
  // Exercise the actual authenticated branch and file route handlers with a
  // database-backed Better Auth session, not only the underlying updateMany calls.
  const routeBranch = await prisma.branch.create({ data: { workspaceId: workspace.id, name: "Route branch " + suffix } });
  const archivedResponse = await archiveBranch(
    new Request("http://localhost/api/branches/" + routeBranch.id + "?workspaceId=" + workspace.id, { method: "DELETE", headers: sessionHeaders }),
    { params: Promise.resolve({ id: routeBranch.id }) },
  );
  assert.equal(archivedResponse.status, 204);
  const restoredBranchResponse = await restoreBranch(
    new Request("http://localhost/api/branches/" + routeBranch.id + "/restore", {
      method: "POST", headers: { cookie: sessionHeaders.get("cookie")!, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    }),
    { params: Promise.resolve({ id: routeBranch.id }) },
  );
  assert.equal(restoredBranchResponse.status, 200);

  const routeFile = await prisma.fileAsset.create({
    data: {
      workspaceId: workspace.id, uploadedById: user.id, originalName: "route-proof.pdf",
      pathname: "security-test/" + suffix + "/route-proof.pdf", contentType: "application/pdf", sizeBytes: 32,
    },
  });
  const outsider = await prisma.user.create({
    data: { id: "outsider-" + suffix, name: "Outsider", email: "outsider-" + suffix + "@example.invalid" },
  });
  outsiderId = outsider.id;
  const outsiderHeaders = await createCredentialAccount(outsider.id, outsider.email, "outsider-" + suffix);
  const routeFeedbackCustomer = await prisma.customer.create({
    data: { workspaceId: workspace.id, branchId: routeBranch.id, externalId: "route-feedback-customer-" + suffix, email: "route-feedback@example.invalid" },
  });
  const routeFeedbackEvent = await prisma.serviceEvent.create({
    data: { workspaceId: workspace.id, branchId: routeBranch.id, customerId: routeFeedbackCustomer.id, externalId: "route-feedback-event-" + suffix, completedAt: new Date() },
  });
  const routeFeedback = await prisma.feedback.create({
    data: { workspaceId: workspace.id, branchId: routeBranch.id, customerId: routeFeedbackCustomer.id, serviceEventId: routeFeedbackEvent.id },
  });
  const createNoteResponse = await createFeedbackNote(
    new Request("http://localhost/api/feedback/" + routeFeedback.id + "/notes", {
      method: "POST",
      headers: { cookie: sessionHeaders.get("cookie")!, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, note: "Internal follow-up context" }),
    }),
    { params: Promise.resolve({ id: routeFeedback.id }) },
  );
  assert.equal(createNoteResponse.status, 201, "workspace writers can add an internal feedback note");
  const notesResponse = await getFeedbackNotes(
    new Request("http://localhost/api/feedback/" + routeFeedback.id + "/notes?workspaceId=" + workspace.id, { headers: sessionHeaders }),
    { params: Promise.resolve({ id: routeFeedback.id }) },
  );
  assert.equal(notesResponse.status, 200);
  const notesBody = await notesResponse.json() as { notes: Array<{ note: string }> };
  assert.equal(notesBody.notes.length, 1);
  assert.equal(notesBody.notes[0].note, "Internal follow-up context");
  const foreignNotesResponse = await getFeedbackNotes(
    new Request("http://localhost/api/feedback/" + routeFeedback.id + "/notes?workspaceId=" + workspace.id, { headers: outsiderHeaders }),
    { params: Promise.resolve({ id: routeFeedback.id }) },
  );
  assert.equal(foreignNotesResponse.status, 403, "non-members cannot read internal feedback notes");
  const routeFeedbackFollowUp = await prisma.followUp.create({
    data: { workspaceId: workspace.id, feedbackId: routeFeedback.id, status: "QUEUED", scheduledAt: new Date() },
  });
  const foreignFeedbackUpdate = await updateFeedbackStatus(
    new Request("http://localhost/api/feedback/" + routeFeedback.id, {
      method: "PATCH",
      headers: { cookie: outsiderHeaders.get("cookie")!, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, status: "RESOLVED" }),
    }),
    { params: Promise.resolve({ id: routeFeedback.id }) },
  );
  assert.equal(foreignFeedbackUpdate.status, 403, "a non-member cannot update another workspace's feedback");
  const optedOutFeedbackUpdate = await updateFeedbackStatus(
    new Request("http://localhost/api/feedback/" + routeFeedback.id, {
      method: "PATCH",
      headers: { cookie: sessionHeaders.get("cookie")!, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, status: "OPTED_OUT" }),
    }),
    { params: Promise.resolve({ id: routeFeedback.id }) },
  );
  assert.equal(optedOutFeedbackUpdate.status, 200);
  const routeCustomerAfterOptOut = await prisma.customer.findUnique({ where: { id: routeFeedbackCustomer.id } });
  const routeFollowUpAfterOptOut = await prisma.followUp.findUnique({ where: { id: routeFeedbackFollowUp.id } });
  assert.ok(routeCustomerAfterOptOut?.optedOutAt);
  assert.equal(routeFollowUpAfterOptOut?.status, "CANCELLED");
  assert.equal(await prisma.auditLog.count({
    where: { targetId: routeFeedback.id, action: "FEEDBACK_STATUS_CHANGED" },
  }), 1, "feedback state, customer opt-out and audit must commit together");
  const crossWorkspaceDelete = await softDeleteFile(
    new Request("http://localhost/api/files/" + routeFile.id, { method: "DELETE", headers: outsiderHeaders }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(crossWorkspaceDelete.status, 404, "cross-workspace file existence must be masked");
  const crossWorkspaceRead = await getFile(
    new Request("http://localhost/api/files/" + routeFile.id, { headers: outsiderHeaders }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(crossWorkspaceRead.status, 404, "cross-workspace file reads must mask resource existence");

  const softDeletedResponse = await softDeleteFile(
    new Request("http://localhost/api/files/" + routeFile.id, { method: "DELETE", headers: sessionHeaders }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(softDeletedResponse.status, 204);
  const crossWorkspaceRestore = await restoreFile(
    new Request("http://localhost/api/files/" + routeFile.id + "/restore", {
      method: "POST", headers: outsiderHeaders,
    }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(crossWorkspaceRestore.status, 404, "cross-workspace recovery must mask resource existence");
  assert.equal(await prisma.auditLog.count({
    where: { targetId: routeFile.id, action: "FILE_SOFT_DELETED" },
  }), 1, "file deletion and its provenance audit must commit together");
  await prisma.workspace.update({ where: { id: workspace.id }, data: { name: workspace.name + " renamed" } });
  const attributedFile = await prisma.fileAsset.findUnique({ where: { id: routeFile.id } });
  assert.equal(attributedFile?.workspaceNameAtDeletion, workspace.name);
  assert.equal(attributedFile?.deletedByNameAtDeletion, user.name);
  const deletedListingResponse = await listWorkspaceFiles(
    new Request("http://localhost/api/files?workspaceId=" + workspace.id + "&includeDeleted=true", { headers: sessionHeaders }),
  );
  assert.equal(deletedListingResponse.status, 200);
  const deletedListing = await deletedListingResponse.json() as { files: Array<{ id: string; workspaceName: string; workspaceId: string; deletedByName: string | null }> };
  const listedEvidence = deletedListing.files.find(item => item.id === routeFile.id);
  assert.equal(listedEvidence?.workspaceName, workspace.name);
  assert.equal(listedEvidence?.workspaceId, workspace.id);
  assert.equal(listedEvidence?.deletedByName, user.name);
  assert.equal(listedEvidence?.workspaceName, workspace.name, "workspace attribution must remain the original deletion-time name after a rename");
  await prisma.workspace.update({ where: { id: workspace.id }, data: { name: workspace.name } });

  const deniedEvidenceResponse = await accessDeletedFile(
    new Request("http://localhost/api/files/" + routeFile.id + "/evidence", { headers: outsiderHeaders }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(deniedEvidenceResponse.status, 404, "cross-workspace evidence existence must be masked");

  const holdHeaders = { cookie: sessionHeaders.get("cookie")!, "content-type": "application/json" };
  const placedHold = await manageFileLegalHold(
    new Request("http://localhost/api/files/" + routeFile.id + "/legal-hold", {
      method: "POST", headers: holdHeaders,
      body: JSON.stringify({ action: "place", reason: "Preserve potential investigation evidence." }),
    }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(placedHold.status, 200);
  const heldFile = await prisma.fileAsset.findUnique({ where: { id: routeFile.id } });
  assert.ok(heldFile?.legalHoldAt);
  assert.equal(heldFile?.legalHoldReason, "Preserve potential investigation evidence.");
  await assert.rejects(
    prisma.fileAsset.delete({ where: { id: routeFile.id } }),
    (error: unknown) => String(error).includes("FILE_LEGAL_HOLD_ACTIVE"),
    "the database must block physical deletion while a legal hold is active",
  );

  await prisma.member.update({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    data: { role: "ADMIN" },
  });
  const adminRelease = await manageFileLegalHold(
    new Request("http://localhost/api/files/" + routeFile.id + "/legal-hold", {
      method: "POST", headers: holdHeaders,
      body: JSON.stringify({ action: "release", reason: "Attempted release by administrator." }),
    }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(adminRelease.status, 403, "only the workspace owner may release a legal hold");
  await prisma.member.update({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    data: { role: "OWNER" },
  });
  const releasedHold = await manageFileLegalHold(
    new Request("http://localhost/api/files/" + routeFile.id + "/legal-hold", {
      method: "POST", headers: holdHeaders,
      body: JSON.stringify({ action: "release", reason: "Investigation preservation request concluded." }),
    }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );
  assert.equal(releasedHold.status, 200);
  assert.equal(await prisma.auditLog.count({
    where: { targetId: routeFile.id, action: { in: ["FILE_LEGAL_HOLD_PLACED", "FILE_LEGAL_HOLD_RELEASED"] } },
  }), 2);

  const restoredFileResponse = await restoreFile(
    new Request("http://localhost/api/files/" + routeFile.id + "/restore", {
      method: "POST", headers: sessionHeaders,
    }),
    { params: Promise.resolve({ id: routeFile.id }) },
  );

  assert.equal(restoredFileResponse.status, 200);
  assert.equal(await prisma.auditLog.count({
    where: { targetId: routeFile.id, action: "FILE_RESTORED" },
  }), 1, "file recovery and its audit event must commit together");

  // Invitation acceptance route: the invitee must be signed in as the invited
  // address, and a successful token cannot be replayed.
  const invitee = await prisma.user.create({
    data: { id: "invitee-" + suffix, name: "Invitee", email: "invitee-" + suffix + "@example.invalid" },
  });
  inviteeId = invitee.id;
  const inviteeHeaders = await createCredentialAccount(invitee.id, invitee.email, "invitee-" + suffix);
  inviteeHeaders.set("content-type", "application/json");
  const rawInvitationToken = "invitation-" + suffix;
  const routeInvitation = await prisma.invitation.create({
    data: {
      workspaceId: workspace.id, email: invitee.email, role: "VIEWER",
      tokenHash: createHash("sha256").update(rawInvitationToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), invitedByUserId: user.id,
    },
  });
  const acceptedResponse = await acceptInvitation(
    new Request("http://localhost/api/invitations/accept", {
      method: "POST", headers: inviteeHeaders, body: JSON.stringify({ token: rawInvitationToken }),
    }),
  );
  assert.equal(acceptedResponse.status, 200);
  const replayResponse = await acceptInvitation(
    new Request("http://localhost/api/invitations/accept", {
      method: "POST", headers: inviteeHeaders, body: JSON.stringify({ token: rawInvitationToken }),
    }),
  );
  assert.equal(replayResponse.status, 400);
  assert.equal(
    await prisma.securityEvent.count({ where: { type: "INVITATION_REPLAY", targetId: routeInvitation.id } }),
    1,
    "replayed invitation acceptance must be recorded by Security Warden",
  );

  // Exercise webhook idempotency and archived-branch rejection through the
  // actual public route, including endpoint-secret hashing and payload checks.
  const webhookBranch = await prisma.branch.create({ data: { workspaceId: workspace.id, name: "Webhook branch " + suffix } });
  const optedOutWebhookCustomer = await prisma.customer.create({
    data: {
      workspaceId: workspace.id,
      branchId: webhookBranch.id,
      externalId: "webhook-customer-" + suffix,
      email: "webhook@example.invalid",
      optedOutAt: new Date(),
    },
  });
  const createdWebhookResponse = await createWebhookEndpoint(
    new Request("http://localhost/api/integrations/webhook", {
      method: "POST",
      headers: { cookie: sessionHeaders.get("cookie")!, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, branchId: webhookBranch.id, label: "CI webhook" }),
    }),
  );
  assert.equal(createdWebhookResponse.status, 201);
  const createdWebhookBody = await createdWebhookResponse.json() as { endpoint: { id: string }; secret: string };
  const webhookSecret = createdWebhookBody.secret;
  const webhookEvent = {
    eventId: "webhook-event-" + suffix,
    workspaceId: workspace.id,
    branchId: webhookBranch.id,
    occurredAt: new Date().toISOString(),
    customer: { externalId: "webhook-customer-" + suffix, email: "webhook@example.invalid" },
    service: { completedAt: new Date().toISOString(), type: "CI test" },
    consent: { feedbackContact: true, recordedAt: new Date().toISOString() },
  };
  const webhookRequest = () => new Request("http://localhost/api/webhooks/service-completed", {
    method: "POST",
    headers: { "x-merit-webhook-secret": webhookSecret, "content-type": "application/json" },
    body: JSON.stringify(webhookEvent),
  });
  const firstWebhook = await serviceCompletedWebhook(webhookRequest());
  assert.equal(firstWebhook.status, 202);
  const firstWebhookBody = await firstWebhook.json() as { feedbackId?: string | null };
  assert.equal(firstWebhookBody.feedbackId, null, "a later integration consent flag must not reverse an explicit customer opt-out");
  const customerAfterWebhook = await prisma.customer.findUnique({ where: { id: optedOutWebhookCustomer.id } });
  assert.ok(customerAfterWebhook?.optedOutAt, "integration events must preserve the existing opt-out timestamp");
  const replayWebhook = await serviceCompletedWebhook(webhookRequest());
  assert.equal(replayWebhook.status, 202);
  assert.equal((await replayWebhook.json()).duplicate, true);

  const archivedWebhookBranch = await archiveBranch(
    new Request("http://localhost/api/branches/" + webhookBranch.id + "?workspaceId=" + workspace.id, { method: "DELETE", headers: sessionHeaders }),
    { params: Promise.resolve({ id: webhookBranch.id }) },
  );
  assert.equal(archivedWebhookBranch.status, 204);
  const rejectedArchivedWebhook = await serviceCompletedWebhook(new Request("http://localhost/api/webhooks/service-completed", {
    method: "POST",
    headers: { "x-merit-webhook-secret": webhookSecret, "content-type": "application/json" },
    body: JSON.stringify({ ...webhookEvent, eventId: "archived-event-" + suffix }),
  }));
  assert.equal(rejectedArchivedWebhook.status, 404);
  const revokedWebhookResponse = await revokeWebhookEndpoint(
    new Request("http://localhost/api/integrations/webhook?id=" + createdWebhookBody.endpoint.id, {
      method: "DELETE",
      headers: sessionHeaders,
    }),
  );
  assert.equal(revokedWebhookResponse.status, 200);
  const rejectedRevokedWebhook = await serviceCompletedWebhook(new Request("http://localhost/api/webhooks/service-completed", {
    method: "POST",
    headers: { "x-merit-webhook-secret": webhookSecret, "content-type": "application/json" },
    body: JSON.stringify({ ...webhookEvent, eventId: "revoked-event-" + suffix }),
  }));
  assert.equal(rejectedRevokedWebhook.status, 401, "revoked integration credentials must not authorize new events");

  // Exercise stale-claim recovery through the real cron handler. With no
  // provider API key in CI, the recovered job must fail safely rather than
  // remain PROCESSING or be silently lost.
  const recoveryBranch = await prisma.branch.create({ data: { workspaceId: workspace.id, name: "Recovery branch " + suffix } });
  const recoveryCustomer = await prisma.customer.create({
    data: { workspaceId: workspace.id, branchId: recoveryBranch.id, externalId: "recovery-customer-" + suffix, email: "recovery@example.invalid" },
  });
  const recoveryEvent = await prisma.serviceEvent.create({
    data: { workspaceId: workspace.id, branchId: recoveryBranch.id, customerId: recoveryCustomer.id, externalId: "recovery-event-" + suffix, completedAt: new Date(Date.now() - 30 * 60 * 1000) },
  });
  const recoveryFeedback = await prisma.feedback.create({
    data: { workspaceId: workspace.id, branchId: recoveryBranch.id, customerId: recoveryCustomer.id, serviceEventId: recoveryEvent.id },
  });
  const staleFirstAttemptAt = new Date(Date.now() - 20 * 60 * 1000);
  const staleFollowUp = await prisma.followUp.create({
    data: {
      workspaceId: workspace.id,
      feedbackId: recoveryFeedback.id,
      status: "PROCESSING",
      processingAt: staleFirstAttemptAt,
      firstAttemptAt: staleFirstAttemptAt,
      scheduledAt: staleFirstAttemptAt,
    },
  });
  const expiredEvent = await prisma.serviceEvent.create({
    data: { workspaceId: workspace.id, branchId: recoveryBranch.id, customerId: recoveryCustomer.id, externalId: "expired-event-" + suffix, completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
  });
  const expiredFeedback = await prisma.feedback.create({
    data: { workspaceId: workspace.id, branchId: recoveryBranch.id, customerId: recoveryCustomer.id, serviceEventId: expiredEvent.id },
  });
  const expiredFollowUp = await prisma.followUp.create({
    data: {
      workspaceId: workspace.id,
      feedbackId: expiredFeedback.id,
      status: "PROCESSING",
      processingAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      firstAttemptAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      scheduledAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });
  const oldResendKey = process.env.RESEND_API_KEY;
  const oldEmailKey = process.env.EMAIL_PROVIDER_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_PROVIDER_API_KEY;
  try {
    const recoveryResponse = await processFollowUps(new Request("http://localhost/api/follow-ups/process", {
      method: "POST",
      headers: { "x-merit-cron-secret": process.env.CRON_SECRET || "" },
    }));
    assert.equal(recoveryResponse.status, 200);
    const recoverySummary = await recoveryResponse.json() as { failed?: number };
    assert.equal(recoverySummary.failed, 2);
    const recoveredJob = await prisma.followUp.findUnique({ where: { id: staleFollowUp.id } });
    assert.equal(recoveredJob?.status, "FAILED");
    assert.equal(recoveredJob?.processingAt, null);
    const expiredJob = await prisma.followUp.findUnique({ where: { id: expiredFollowUp.id } });
    assert.equal(expiredJob?.status, "FAILED", "ambiguous provider requests older than the idempotency window must not be resent");
    assert.match(expiredJob?.error ?? "", /manual reconciliation/i);
  } finally {
    if (oldResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldResendKey;
    if (oldEmailKey === undefined) delete process.env.EMAIL_PROVIDER_API_KEY;
    else process.env.EMAIL_PROVIDER_API_KEY = oldEmailKey;
  }


  // Opening the feedback CTA must not count as a click: email scanners prefetch GET links.
  const feedbackToken = createFeedbackToken(recoveryFeedback.id);
  const clickResponse = await openFeedbackClick(
    new Request("http://localhost/api/feedback/" + recoveryFeedback.id + "/click?t=" + encodeURIComponent(feedbackToken)),
    { params: Promise.resolve({ id: recoveryFeedback.id }) },
  );
  assert.equal(clickResponse.status, 307);
  const afterPrefetch = await prisma.feedback.findUnique({ where: { id: recoveryFeedback.id } });
  assert.equal(afterPrefetch?.clickedAt, null, "GET prefetch must not record a customer click");
  assert.equal(afterPrefetch?.status, "PENDING", "GET prefetch must not change feedback state");

  // Opening an opt-out link must be safe against automated email link scanners.
  const optOutToken = createFeedbackToken(recoveryFeedback.id);
  const optOutUrl = "http://localhost/api/feedback/" + recoveryFeedback.id + "/optout?t=" + encodeURIComponent(optOutToken);
  const confirmationPage = await openOptOutLink(
    new Request(optOutUrl),
    { params: Promise.resolve({ id: recoveryFeedback.id }) },
  );
  assert.equal(confirmationPage.status, 200);
  assert.match(await confirmationPage.text(), /Confirm opt-out/);
  const beforeConfirmation = await prisma.customer.findUnique({ where: { id: recoveryCustomer.id } });
  const feedbackBeforeConfirmation = await prisma.feedback.findUnique({ where: { id: recoveryFeedback.id } });
  assert.equal(beforeConfirmation?.optedOutAt, null, "GET must not change customer consent");
  assert.equal(feedbackBeforeConfirmation?.status, "PENDING", "GET must not change feedback status");

  const confirmedOptOut = await confirmOptOut(
    new Request("http://localhost/api/feedback/" + recoveryFeedback.id + "/optout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: optOutToken }),
    }),
    { params: Promise.resolve({ id: recoveryFeedback.id }) },
  );
  assert.equal(confirmedOptOut.status, 303);
  const afterConfirmation = await prisma.customer.findUnique({ where: { id: recoveryCustomer.id } });
  const feedbackAfterConfirmation = await prisma.feedback.findUnique({ where: { id: recoveryFeedback.id } });
  assert.ok(afterConfirmation?.optedOutAt, "explicit POST confirmation must record the opt-out");
  assert.equal(feedbackAfterConfirmation?.status, "OPTED_OUT");

});
