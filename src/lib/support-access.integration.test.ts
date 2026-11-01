import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, PlatformAccessRole, SupportAccessScope, SupportAccessStatus, Role } from "@prisma/client";
import { canAccessPlatform } from "./platform-access";
import { isSupportAuthorizationActive } from "./support-access-policy";
import { executeApprovedSupportReadInTransaction } from "./support-access";
import { createSupportAccessDecisionHandler } from "./support-access-api";
import { createSupportAccessRequestHandler, createSupportAccessRequesterCancelHandler } from "./support-access-request-api";

const prisma = new PrismaClient();

test("database-backed support authorization is scoped, time-limited, revocable, and audited", async (t) => {
  const suffix = randomUUID();
  const operatorId = `integration-operator-${suffix}`;
  const ownerId = `integration-owner-${suffix}`;
  const otherOwnerId = `integration-other-owner-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";

  try {
    await prisma.user.createMany({
      data: [
        { id: operatorId, name: "CI Operator", email: `operator-${suffix}@example.invalid`, emailVerified: true },
        { id: ownerId, name: "CI Workspace Owner", email: `owner-${suffix}@example.invalid`, emailVerified: true },
        { id: otherOwnerId, name: "CI Other Owner", email: `other-owner-${suffix}@example.invalid`, emailVerified: true },
      ],
    });

    const [workspace, otherWorkspace] = await Promise.all([
      prisma.workspace.create({ data: { name: `Support Access Test ${suffix}` } }),
      prisma.workspace.create({ data: { name: `Isolation Test ${suffix}` } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;

    await prisma.platformAccess.create({
      data: { userId: operatorId, role: PlatformAccessRole.ENGINEER },
    });
    await prisma.member.createMany({
      data: [
        { workspaceId, userId: ownerId, email: `owner-${suffix}@example.invalid`, role: Role.OWNER },
        { workspaceId: otherWorkspaceId, userId: otherOwnerId, email: `other-owner-${suffix}@example.invalid`, role: Role.OWNER },
      ],
    });

    const callDecision = async (
      actorId: string,
      targetWorkspaceId: string,
      requestId: string,
      decision: "APPROVE" | "DENY" | "REVOKE",
      origin = "https://merit-olive.vercel.app",
    ) => {
      const handler = createSupportAccessDecisionHandler({
        prisma,
        getSession: async () => ({ user: { id: actorId } }),
      });
      return handler(new Request(
        `https://merit-olive.vercel.app/api/workspaces/${targetWorkspaceId}/support-access`,
        {
          method: "PATCH",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ requestId, decision }),
        },
      ), { params: Promise.resolve({ workspaceId: targetWorkspaceId }) });
    };

    const createHandler = createSupportAccessRequestHandler({
      prisma,
      authorize: async () => ({ ok: true, session: { user: { id: operatorId } } }),
    });
    const createRequest = (payload: unknown) => createHandler(new Request(
      "https://merit-olive.vercel.app/api/platform/support-requests",
      {
        method: "POST",
        headers: { origin: "https://merit-olive.vercel.app", "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ));

    const cancelRequest = async (actorId: string, requestId: string, origin = "https://merit-olive.vercel.app") => {
      const handler = createSupportAccessRequesterCancelHandler({
        prisma,
        getSession: async () => ({ user: { id: actorId } }),
      });
      return handler(new Request(
        `https://merit-olive.vercel.app/api/platform/support-requests/${requestId}`,
        { method: "DELETE", headers: { origin } },
      ), { params: Promise.resolve({ requestId }) });
    };

    assert.equal(canAccessPlatform(
      { role: PlatformAccessRole.ENGINEER, revokedAt: null },
      "platform:security:read",
    ), true);

    const createResponse = await createRequest({
      workspaceId,
      scope: SupportAccessScope.FEEDBACK_READ,
      reason: "Investigate a customer-reported feedback display issue.",
      durationMinutes: 60,
    });
    assert.equal(createResponse.status, 201);
    const createBody = await createResponse.json() as { request: { id: string } };
    const pending = await prisma.supportAccessRequest.findUniqueOrThrow({ where: { id: createBody.request.id } });
    assert.equal(pending.status, SupportAccessStatus.PENDING);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: pending.id, action: "SUPPORT_ACCESS_REQUESTED" },
    }), 1);
    assert.equal(await prisma.securityEvent.count({
      where: { workspaceId: null, targetId: workspaceId, type: "SUPPORT_ACCESS_REQUESTED" },
    }), 1);
    assert.equal((await createRequest({
      workspaceId,
      scope: SupportAccessScope.FEEDBACK_READ,
      reason: "A duplicate request must be rejected by the API.",
      durationMinutes: 30,
    })).status, 409);
    assert.equal((await createRequest({
      workspaceId: "missing-workspace",
      scope: SupportAccessScope.FEEDBACK_READ,
      reason: "The API must reject unknown workspace identifiers.",
      durationMinutes: 30,
    })).status, 404);

    // A pending request never authorizes access, including from a different workspace.
    assert.equal(isSupportAuthorizationActive({
      workspaceId, requestedByUserId: operatorId, scope: pending.scope,
      status: pending.status, revokedAt: pending.revokedAt, expiresAt: pending.expiresAt,
    }, { workspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ, now }), false);

    const selfApprovalRequest = await prisma.supportAccessRequest.create({
      data: {
        workspaceId,
        requestedByUserId: ownerId,
        scope: SupportAccessScope.CUSTOMER_RECORDS_READ,
        reason: "Verify that a workspace owner cannot approve their own request.",
        requestedDurationMinutes: 30,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.equal((await callDecision(ownerId, workspaceId, selfApprovalRequest.id, "APPROVE")).status, 409);
    assert.equal((await callDecision(otherOwnerId, workspaceId, pending.id, "APPROVE")).status, 403);
    assert.equal((await callDecision(otherOwnerId, otherWorkspaceId, pending.id, "APPROVE")).status, 404);
    assert.equal((await callDecision(ownerId, workspaceId, pending.id, "APPROVE", "https://evil.example")).status, 403);

    const approvalResponse = await callDecision(ownerId, workspaceId, pending.id, "APPROVE");
    assert.equal(approvalResponse.status, 200);
    const approved = await prisma.supportAccessRequest.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(approved.status, SupportAccessStatus.APPROVED);
    assert.equal(approved.decidedByUserId, ownerId);
    assert.ok(approved.expiresAt && approved.expiresAt > new Date());
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: pending.id, action: "SUPPORT_ACCESS_APPROVED" },
    }), 1);
    assert.equal(await prisma.securityEvent.count({
      where: { workspaceId: null, targetId: workspaceId, type: "SUPPORT_ACCESS_APPROVED" },
    }), 1);

    const requesterCancel = await createRequest({
      workspaceId,
      scope: SupportAccessScope.CUSTOMER_RECORDS_READ,
      reason: "Test the operator's ability to cancel a pending request.",
      durationMinutes: 30,
    });
    assert.equal(requesterCancel.status, 201);
    const cancelBody = await requesterCancel.json() as { request: { id: string } };
    assert.equal((await cancelRequest(operatorId, cancelBody.request.id)).status, 200);
    const cancelled = await prisma.supportAccessRequest.findUniqueOrThrow({ where: { id: cancelBody.request.id } });
    assert.equal(cancelled.status, SupportAccessStatus.REVOKED);
    assert.equal((await cancelRequest(operatorId, cancelBody.request.id)).status, 409);
    assert.equal((await cancelRequest(ownerId, pending.id)).status, 404);
    assert.equal((await cancelRequest(operatorId, cancelBody.request.id, "https://evil.example")).status, 403);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: cancelBody.request.id, action: "SUPPORT_ACCESS_REVOKED" },
    }), 1);

    const deniedRequest = await prisma.supportAccessRequest.create({
      data: {
        workspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FILE_ASSETS_READ,
        reason: "Review the access denial flow using the actual decision handler.",
        requestedDurationMinutes: 30,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.equal((await callDecision(ownerId, workspaceId, deniedRequest.id, "DENY")).status, 200);
    const denied = await prisma.supportAccessRequest.findUniqueOrThrow({ where: { id: deniedRequest.id } });
    assert.equal(denied.status, SupportAccessStatus.DENIED);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: deniedRequest.id, action: "SUPPORT_ACCESS_DENIED" },
    }), 1);

    const activeGrant = {
      workspaceId: approved.workspaceId,
      requestedByUserId: approved.requestedByUserId,
      scope: approved.scope,
      status: approved.status,
      revokedAt: approved.revokedAt,
      expiresAt: approved.expiresAt,
    };
    assert.equal(isSupportAuthorizationActive(activeGrant, {
      workspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ, now: new Date(),
    }), true);

    const scopedRead = await prisma.$transaction((tx) =>
      executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId,
        scope: SupportAccessScope.FEEDBACK_READ,
        targetType: "INTEGRATION_TEST",
        read: async (readTx) => readTx.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true },
        }),
      }),
      { isolationLevel: "Serializable" },
    );
    assert.equal(scopedRead.authorized, true);
    if (scopedRead.authorized) assert.equal(scopedRead.data?.id, workspaceId);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, action: "SUPPORT_ACCESS_USED", targetType: "INTEGRATION_TEST" },
    }), 1);

    let wrongWorkspaceQueryExecuted = false;
    const wrongWorkspaceRead = await prisma.$transaction((tx) =>
      executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId: otherWorkspaceId,
        scope: SupportAccessScope.FEEDBACK_READ,
        targetType: "INTEGRATION_TEST",
        read: async () => { wrongWorkspaceQueryExecuted = true; return "should-not-run"; },
      }),
      { isolationLevel: "Serializable" },
    );
    assert.equal(wrongWorkspaceRead.authorized, false);
    assert.equal(wrongWorkspaceQueryExecuted, false);

    let wrongScopeQueryExecuted = false;
    const wrongScopeRead = await prisma.$transaction((tx) =>
      executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId,
        scope: SupportAccessScope.FILE_ASSETS_READ,
        targetType: "INTEGRATION_TEST",
        read: async () => { wrongScopeQueryExecuted = true; return "should-not-run"; },
      }),
      { isolationLevel: "Serializable" },
    );
    assert.equal(wrongScopeRead.authorized, false);
    assert.equal(wrongScopeQueryExecuted, false);
    assert.equal(isSupportAuthorizationActive(activeGrant, {
      workspaceId: otherWorkspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ,
    }), false);
    assert.equal(isSupportAuthorizationActive(activeGrant, {
      workspaceId, userId: operatorId, scope: SupportAccessScope.FILE_ASSETS_READ,
    }), false);

    const matchingGrant = await prisma.supportAccessRequest.findFirst({
      where: {
        workspaceId: otherWorkspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FEEDBACK_READ,
        status: SupportAccessStatus.APPROVED,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    assert.equal(matchingGrant, null, "an approval for one workspace must not match another workspace");

    const revokeResponse = await callDecision(ownerId, workspaceId, pending.id, "REVOKE");
    assert.equal(revokeResponse.status, 200);
    const revoked = await prisma.supportAccessRequest.findUniqueOrThrow({ where: { id: pending.id } });

    assert.equal(isSupportAuthorizationActive({
      workspaceId: revoked.workspaceId,
      requestedByUserId: revoked.requestedByUserId,
      scope: revoked.scope,
      status: revoked.status,
      revokedAt: revoked.revokedAt,
      expiresAt: revoked.expiresAt,
    }, { workspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ }), false);

    let revokedQueryExecuted = false;
    const revokedRead = await prisma.$transaction((tx) =>
      executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId,
        scope: SupportAccessScope.FEEDBACK_READ,
        targetType: "INTEGRATION_TEST",
        read: async () => { revokedQueryExecuted = true; return "should-not-run"; },
      }),
      { isolationLevel: "Serializable" },
    );
    assert.equal(revokedRead.authorized, false);
    assert.equal(revokedQueryExecuted, false);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: pending.id, action: "SUPPORT_ACCESS_REVOKED" },
    }), 1);
    assert.equal(await prisma.securityEvent.count({
      where: { workspaceId: null, targetId: workspaceId, type: "SUPPORT_ACCESS_REVOKED" },
    }), 1);

    // Revoking the platform role independently blocks platform capability.
    await prisma.platformAccess.update({
      where: { userId: operatorId },
      data: { revokedAt: new Date() },
    });
    const revokedPlatformAccess = await prisma.platformAccess.findUnique({
      where: { userId: operatorId },
      select: { role: true, revokedAt: true },
    });
    assert.equal(canAccessPlatform(revokedPlatformAccess, "platform:security:read"), false);

    const inactiveOperatorRequest = await prisma.supportAccessRequest.create({
      data: {
        workspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FEEDBACK_REPLIES_READ,
        reason: "Confirm inactive operators cannot receive a business-approved grant.",
        requestedDurationMinutes: 30,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.equal((await callDecision(ownerId, workspaceId, inactiveOperatorRequest.id, "APPROVE")).status, 409);
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    if (otherWorkspaceId) await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [operatorId, ownerId, otherOwnerId] } } }).catch(() => undefined);
  }
});
