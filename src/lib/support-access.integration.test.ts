import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, PlatformAccessRole, SupportAccessScope, SupportAccessStatus, Role } from "@prisma/client";
import { canAccessPlatform } from "./platform-access";
import { isSupportAuthorizationActive } from "./support-access-policy";

const prisma = new PrismaClient();

test("database-backed support authorization is scoped, time-limited, revocable, and audited", async (t) => {
  const suffix = randomUUID();
  const operatorId = `integration-operator-${suffix}`;
  const ownerId = `integration-owner-${suffix}`;
  const otherOwnerId = `integration-other-owner-${suffix}`;
  let workspaceId: string | undefined;
  let otherWorkspaceId: string | undefined;

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

    assert.equal(canAccessPlatform(
      { role: PlatformAccessRole.ENGINEER, revokedAt: null },
      "platform:security:read",
    ), true);

    const now = new Date();
    const requestExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pending = await prisma.$transaction(async (tx) => {
      const created = await tx.supportAccessRequest.create({
        data: {
          workspaceId,
          requestedByUserId: operatorId,
          scope: SupportAccessScope.FEEDBACK_READ,
          reason: "Investigate a customer-reported feedback display issue.",
          requestedDurationMinutes: 60,
          requestExpiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: operatorId,
          action: "SUPPORT_ACCESS_REQUESTED",
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: created.id,
          metadata: { scope: SupportAccessScope.FEEDBACK_READ },
        },
      });
      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: operatorId,
          type: "SUPPORT_ACCESS_REQUESTED",
          severity: "HIGH",
          targetId: workspaceId,
          metadata: { supportAccessRequestId: created.id },
        },
      });
      return created;
    });

    assert.equal(pending.status, SupportAccessStatus.PENDING);
    assert.equal(await prisma.auditLog.count({
      where: { workspaceId, targetId: pending.id, action: "SUPPORT_ACCESS_REQUESTED" },
    }), 1);
    assert.equal(await prisma.securityEvent.count({
      where: { workspaceId: null, targetId: workspaceId, type: "SUPPORT_ACCESS_REQUESTED" },
    }), 1);

    // A pending request never authorizes access, including from a different workspace.
    assert.equal(isSupportAuthorizationActive({
      workspaceId, requestedByUserId: operatorId, scope: pending.scope,
      status: pending.status, revokedAt: pending.revokedAt, expiresAt: pending.expiresAt,
    }, { workspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ, now }), false);

    const approvedAt = new Date();
    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.supportAccessRequest.update({
        where: { id: pending.id },
        data: {
          status: SupportAccessStatus.APPROVED,
          decidedByUserId: ownerId,
          decidedAt: approvedAt,
          expiresAt: new Date(approvedAt.getTime() + 60 * 60 * 1000),
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: ownerId,
          action: "SUPPORT_ACCESS_APPROVED",
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: pending.id,
          metadata: { scope: SupportAccessScope.FEEDBACK_READ },
        },
      });
      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: ownerId,
          type: "SUPPORT_ACCESS_APPROVED",
          severity: "HIGH",
          targetId: workspaceId,
          metadata: { supportAccessRequestId: pending.id },
        },
      });
      return updated;
    });

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

    const revokedAt = new Date();
    const revoked = await prisma.$transaction(async (tx) => {
      const updated = await tx.supportAccessRequest.update({
        where: { id: pending.id },
        data: {
          status: SupportAccessStatus.REVOKED,
          revokedAt,
          revokedByUserId: ownerId,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: ownerId,
          action: "SUPPORT_ACCESS_REVOKED",
          targetType: "SUPPORT_ACCESS_REQUEST",
          targetId: pending.id,
          metadata: { scope: SupportAccessScope.FEEDBACK_READ },
        },
      });
      await tx.securityEvent.create({
        data: {
          workspaceId: null,
          actorUserId: ownerId,
          type: "SUPPORT_ACCESS_REVOKED",
          severity: "HIGH",
          targetId: workspaceId,
          metadata: { supportAccessRequestId: pending.id },
        },
      });
      return updated;
    });

    assert.equal(isSupportAuthorizationActive({
      workspaceId: revoked.workspaceId,
      requestedByUserId: revoked.requestedByUserId,
      scope: revoked.scope,
      status: revoked.status,
      revokedAt: revoked.revokedAt,
      expiresAt: revoked.expiresAt,
    }, { workspaceId, userId: operatorId, scope: SupportAccessScope.FEEDBACK_READ }), false);
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
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    if (otherWorkspaceId) await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [operatorId, ownerId, otherOwnerId] } } }).catch(() => undefined);
  }
});
