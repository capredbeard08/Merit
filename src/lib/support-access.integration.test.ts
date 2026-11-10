import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient, PlatformAccessRole, SupportAccessScope, SupportAccessStatus, Role } from "@prisma/client";
import { canAccessPlatform } from "./platform-access";
import { isSupportAuthorizationActive } from "./support-access-policy";
import { executeApprovedSupportReadInTransaction, withApprovedSupportRead } from "./support-access";
import { createSupportAccessDecisionHandler } from "./support-access-api";
import { createSupportAccessRequestHandler, createSupportAccessRequesterCancelHandler } from "./support-access-request-api";
import { auth } from "./better-auth";
import { requirePlatformCapability } from "./platform-admin";
import { consumePlatformRateLimit } from "./platform-rate-limit";
import { POST as founderBootstrapPost } from "../app/api/platform/bootstrap/route";
import { POST as grantPlatformOperator, DELETE as revokePlatformOperator } from "../app/api/platform/operators/route";

const prisma = new PrismaClient();

function decodeBase32(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of input.replace(/=+$/g, "").toUpperCase()) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Invalid base32 TOTP secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function signInWithTotp(email: string, password: string, secret: string): Promise<string> {
  const challenge = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const challengeBody = challenge.response as { twoFactorRedirect?: boolean };
  assert.equal(challengeBody.twoFactorRedirect, true, "enabled MFA must withhold the authenticated session");
  const challengeHeaders = challenge.headers as Headers & { getSetCookie?: () => string[] };
  const challengeCookies = challengeHeaders.getSetCookie?.() ?? [challengeHeaders.get("set-cookie") ?? ""];
  const challengeCookie = challengeCookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  assert.ok(challengeCookie, "Better Auth must issue a two-factor challenge cookie");

  const verified = await auth.api.verifyTOTP({
    body: { code: currentTotp(secret), trustDevice: false },
    headers: new Headers({
      cookie: challengeCookie,
      origin: "https://merit-olive.vercel.app",
      "user-agent": "MERIT-CI-Integration-Test",
    }),
    asResponse: true,
  });
  assert.equal(
    verified.status,
    200,
    "valid TOTP must complete the pending sign-in challenge: " + await verified.clone().text(),
  );
  const verifiedHeaders = verified.headers as Headers & { getSetCookie?: () => string[] };
  const sessionCookies = verifiedHeaders.getSetCookie?.() ?? [verifiedHeaders.get("set-cookie") ?? ""];
  const sessionCookie = sessionCookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  assert.ok(sessionCookie, "successful TOTP verification must issue an authenticated session cookie");
  return sessionCookie;
}

test("platform rate limiting is shared, fixed-window, and fails closed on excess", async () => {
  const subject = "rate-limit-integration-" + randomUUID();
  const first = await consumePlatformRateLimit(subject, "test-action", 2, 60_000);
  const second = await consumePlatformRateLimit(subject, "test-action", 2, 60_000);
  const third = await consumePlatformRateLimit(subject, "test-action", 2, 60_000);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  if (!third.allowed) assert.ok(third.retryAfterSeconds > 0);
});

test("database-backed support authorization is scoped, time-limited, revocable, and audited", async (t) => {
  const suffix = randomUUID();
  let operatorId = "";
  const operatorEmail = `operator-${suffix}@example.invalid`;
  const ownerId = `integration-owner-${suffix}`;
  const otherOwnerId = `integration-other-owner-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";

  try {
    // Sign up through Better Auth itself so the test receives a correctly
    // signed session cookie rather than hand-constructing an invalid token.
    const signupResponse = await auth.api.signUpEmail({
      body: {
        name: "CI Operator",
        email: operatorEmail,
        password: "CI-only-strong-password-123!",
      },
      asResponse: true,
    });
    assert.equal(signupResponse.status, 200, "Better Auth sign-up should create a CI operator session");
    const signupBody = await signupResponse.json() as { user: { id: string } };
    operatorId = signupBody.user.id;
    const sessionCookie = signupResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(sessionCookie, "Better Auth sign-up must issue a signed session cookie");

    await prisma.user.createMany({
      data: [
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

    // Exercise Better Auth's actual signed session cookie and the production
    // platform capability middleware rather than substituting a session.
    const sessionHeaders = new Headers({
      cookie: sessionCookie,
      origin: "https://merit-olive.vercel.app",
    });
    const realSession = await auth.api.getSession({ headers: sessionHeaders });
    assert.equal(realSession?.user.id, operatorId, "Better Auth must resolve the persisted CI session");
    assert.ok(realSession?.session.id, "Better Auth session identifier should be available");
    const originalCreatedAt = realSession!.session.createdAt;
    await prisma.session.update({
      where: { id: realSession!.session.id },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const staleStepUp = await requirePlatformCapability(
      new Request("https://merit-olive.vercel.app/api/platform/operators", { headers: sessionHeaders }),
      "platform:access:grant",
      true,
      { requireRecentAuthentication: true },
    );
    assert.equal(staleStepUp.ok, false, "sensitive actions must reject sessions older than ten minutes");
    if (!staleStepUp.ok) assert.equal(staleStepUp.response.status, 428);
    await prisma.session.update({
      where: { id: realSession!.session.id },
      data: { createdAt: originalCreatedAt },
    });
    const realMiddlewareRequest = new Request(
      "https://merit-olive.vercel.app/api/platform/security-events",
      { headers: sessionHeaders },
    );
    const allowedByRealMiddleware = await requirePlatformCapability(
      realMiddlewareRequest,
      "platform:security:read",
      true,
    );
    assert.equal(allowedByRealMiddleware.ok, true, "active Engineer must pass real middleware for security read");
    const deniedByRealMiddleware = await requirePlatformCapability(
      realMiddlewareRequest,
      "platform:users:manage",
      true,
    );
    assert.equal(deniedByRealMiddleware.ok, false, "Engineer must fail real middleware for user administration");
    const deniedWithoutMfa = await requirePlatformCapability(
      realMiddlewareRequest,
      "platform:security:read",
      true,
      { requireMfa: true },
    );
    assert.equal(deniedWithoutMfa.ok, false, "MFA-protected requests must reject accounts without enrolled MFA");
    if (!deniedWithoutMfa.ok) assert.equal(deniedWithoutMfa.response.status, 403);
    // Enrol a real TOTP authenticator through Better Auth in CI, then verify
    // a time-based code generated from the returned otpauth URI.
    const enrollment = await auth.api.enableTwoFactor({
      body: { password: "CI-only-strong-password-123!", method: "totp", issuer: "MERIT" },
      headers: sessionHeaders,
    }) as { method: "totp"; totpURI: string; backupCodes: string[] };
    assert.equal(enrollment.method, "totp");
    assert.equal(enrollment.backupCodes.length > 0, true, "TOTP enrollment must issue recovery backup codes");
    const totpSecret = new URL(enrollment.totpURI).searchParams.get("secret");
    assert.ok(totpSecret, "TOTP setup URI must contain an authenticator secret");
    const totpVerificationResponse = await auth.api.verifyTOTP({
      body: { code: currentTotp(totpSecret), trustDevice: false },
      headers: sessionHeaders,
      asResponse: true,
    });
    assert.equal(totpVerificationResponse.status, 200, "Better Auth must accept a valid TOTP enrollment code");
    const refreshedSessionCookie = totpVerificationResponse.headers.get("set-cookie")?.split(";")[0];
    if (refreshedSessionCookie) sessionHeaders.set("cookie", refreshedSessionCookie);
    const sessionAfterEnrollment = await auth.api.getSession({ headers: sessionHeaders });
    assert.equal(sessionAfterEnrollment?.user.id, operatorId, "enrollment session should remain authenticated");
    const persistedMfa = await prisma.user.findUniqueOrThrow({
      where: { id: operatorId },
      select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
    });
    assert.equal(persistedMfa.twoFactorEnabled, true, "MFA is enabled only after a valid TOTP enrollment code");
    assert.ok(persistedMfa.twoFactorEnabledAt, "database trigger must timestamp verified MFA enrollment");

    // Simulate a still-valid session that predates an already-enrolled MFA
    // factor (for example, a legacy session surviving a security-policy change).
    // A fresh password + TOTP challenge below must replace this stale proof.
    await prisma.session.update({
      where: { id: sessionAfterEnrollment!.session.id },
      data: { createdAt: new Date(persistedMfa.twoFactorEnabledAt!.getTime() - 1000) },
    });

    const preEnrollmentSession = await requirePlatformCapability(
      new Request("https://merit-olive.vercel.app/api/platform/security-events", { headers: sessionHeaders }),
      "platform:security:read",
      true,
      { requireMfa: true },
    );
    assert.equal(preEnrollmentSession.ok, false,
      "a session created before MFA enrollment must not satisfy privileged step-up");

    const freshMfaCookie = await signInWithTotp(operatorEmail, "CI-only-strong-password-123!", totpSecret);
    sessionHeaders.set("cookie", freshMfaCookie);
    const sessionAfterMfa = await auth.api.getSession({ headers: sessionHeaders });
    assert.equal(sessionAfterMfa?.user.id, operatorId);
    assert.ok(
      new Date(sessionAfterMfa!.session.createdAt).getTime() >= persistedMfa.twoFactorEnabledAt!.getTime(),
      "the authenticated session must be issued after successful MFA verification",
    );

    const requestAfterMfa = new Request(
      "https://merit-olive.vercel.app/api/platform/security-events",
      { headers: sessionHeaders },
    );
    const allowedWithMfa = await requirePlatformCapability(
      requestAfterMfa,
      "platform:security:read",
      true,
      { requireMfa: true },
    );
    if (!allowedWithMfa.ok) assert.fail("MFA-verified session was denied: " + await allowedWithMfa.response.clone().text());
    const unauthenticatedByRealMiddleware = await requirePlatformCapability(
      new Request("https://merit-olive.vercel.app/api/platform/security-events", {
        headers: { origin: "https://merit-olive.vercel.app" },
      }),
      "platform:security:read",
      true,
    );
    assert.equal(unauthenticatedByRealMiddleware.ok, false, "missing Better Auth session must fail closed");

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

    // Two simultaneous requests for the same operator/workspace/scope must
    // never create two live grants or pending requests.
    const concurrentPayload = {
      workspaceId,
      scope: SupportAccessScope.FEEDBACK_REPLIES_READ,
      reason: "Exercise concurrent duplicate request serialization safely.",
      durationMinutes: 30,
    };
    const concurrentCreates = await Promise.all([
      createRequest(concurrentPayload),
      createRequest(concurrentPayload),
    ]);
    assert.deepEqual(concurrentCreates.map((response) => response.status).sort(), [201, 409]);
    assert.equal(await prisma.supportAccessRequest.count({
      where: {
        workspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FEEDBACK_REPLIES_READ,
        status: SupportAccessStatus.PENDING,
        requestExpiresAt: { gt: new Date() },
      },
    }), 1, "concurrent duplicate submissions must produce exactly one pending request");

    const concurrentDecisionRequest = await prisma.supportAccessRequest.create({
      data: {
        workspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FILE_ASSETS_READ,
        reason: "Exercise concurrent business decisions on one pending request.",
        requestedDurationMinutes: 30,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const concurrentDecisions = await Promise.all([
      callDecision(ownerId, workspaceId, concurrentDecisionRequest.id, "APPROVE"),
      callDecision(ownerId, workspaceId, concurrentDecisionRequest.id, "DENY"),
    ]);
    assert.deepEqual(concurrentDecisions.map((response) => response.status).sort(), [200, 409]);
    const concurrentDecisionFinal = await prisma.supportAccessRequest.findUniqueOrThrow({
      where: { id: concurrentDecisionRequest.id },
    });
    assert.ok(
      concurrentDecisionFinal.status === SupportAccessStatus.APPROVED ||
      concurrentDecisionFinal.status === SupportAccessStatus.DENIED,
      "exactly one concurrent business decision must win",
    );

    const now = new Date();
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

    const guardedSupportRead = await withApprovedSupportRead({
      request: new Request("https://merit-olive.vercel.app/api/platform/support-read", { headers: sessionHeaders }),
      workspaceId,
      scope: SupportAccessScope.FEEDBACK_READ,
      targetType: "INTEGRATION_TEST_STEP_UP_GUARD",
      read: async (readTx) => readTx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }),
    });
    assert.equal(guardedSupportRead.authorized, true,
      "support data reads must require a recent session issued after TOTP verification");
    if (guardedSupportRead.authorized) assert.equal(guardedSupportRead.data?.id, workspaceId);

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
    }), 2); // requester cancellation plus business revocation

    // Race semantics: a read that has already passed authorization may
    // serialize before a concurrent revocation. Once revocation commits, however,
    // every newly-started read must be denied. Do not promise cancellation of
    // already-authorized in-flight work.
    const raceRequest = await prisma.supportAccessRequest.create({
      data: {
        workspaceId,
        requestedByUserId: operatorId,
        scope: SupportAccessScope.FEEDBACK_READ,
        reason: "Verify support-read behavior during concurrent revocation.",
        requestedDurationMinutes: 30,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.equal((await callDecision(ownerId, workspaceId, raceRequest.id, "APPROVE")).status, 200);

    let markReadAuthorized!: () => void;
    let releaseRead!: () => void;
    const readAuthorized = new Promise<void>((resolve) => { markReadAuthorized = resolve; });
    const release = new Promise<void>((resolve) => { releaseRead = resolve; });
    const inFlightRead = prisma.$transaction(async (tx) => {
      const result = await executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId,
        scope: SupportAccessScope.FEEDBACK_READ,
        targetType: "INTEGRATION_TEST_REVOCATION_RACE",
        read: async (readTx) => {
          markReadAuthorized();
          await release;
          return readTx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
        },
      });
      return result;
    }, { isolationLevel: "Serializable" }).then(
      (value) => ({ kind: "completed" as const, value }),
      (error: unknown) => ({ kind: "failed" as const, error }),
    );

    await readAuthorized;
    const raceRevokeResponse = await callDecision(ownerId, workspaceId, raceRequest.id, "REVOKE");
    assert.equal(raceRevokeResponse.status, 200, "business revocation must commit while a read is in flight");
    releaseRead();

    const inFlightOutcome = await inFlightRead;
    if (inFlightOutcome.kind === "completed") {
      assert.equal(inFlightOutcome.value.authorized, true,
        "a read authorized before revocation may validly serialize before it");
    } else {
      const error = inFlightOutcome.error as { code?: string };
      assert.equal(error.code, "P2034",
        "a conflicting serializable read must fail closed with a retryable transaction conflict");
    }

    let postRevocationQueryExecuted = false;
    const postRevocationRead = await prisma.$transaction((tx) =>
      executeApprovedSupportReadInTransaction(tx, {
        actorUserId: operatorId,
        workspaceId,
        scope: SupportAccessScope.FEEDBACK_READ,
        targetType: "INTEGRATION_TEST_AFTER_REVOCATION",
        read: async () => { postRevocationQueryExecuted = true; return "must-not-run"; },
      }),
      { isolationLevel: "Serializable" },
    );
    assert.equal(postRevocationRead.authorized, false,
      "a new support read after committed revocation must be denied");
    assert.equal(postRevocationQueryExecuted, false,
      "the protected data query must not execute after revocation commits");

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
    // CI fixture teardown explicitly removes its platform grant before deleting
    // the fixture user; production account deletion is blocked by the FK.
    await prisma.platformAccess.deleteMany({ where: { userId: { in: [operatorId] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [operatorId, ownerId, otherOwnerId] } } }).catch(() => undefined);
  }
});


test("Founder bootstrap and operator grant/revoke require real verified sessions and audit changes", async () => {
  const suffix = randomUUID();
  const founderEmail = `founder-${suffix}@example.invalid`;
  const targetEmail = `target-${suffix}@example.invalid`;
  const unverifiedEmail = `unverified-${suffix}@example.invalid`;
  const bootstrapSecret = `ci-founder-bootstrap-secret-${suffix}-with-more-than-32-bytes`;
  const previousSecret = process.env.FOUNDER_BOOTSTRAP_SECRET;
  const previousFounderEmail = process.env.FOUNDER_BOOTSTRAP_EMAIL;
  let founderId = "";
  let targetId = "";
  let unverifiedId = "";

  try {
    process.env.FOUNDER_BOOTSTRAP_SECRET = bootstrapSecret;
    process.env.FOUNDER_BOOTSTRAP_EMAIL = founderEmail;
    const signupResponse = await auth.api.signUpEmail({
      body: {
        name: "CI Founder",
        email: founderEmail,
        password: "CI-only-strong-password-123!",
      },
      asResponse: true,
    });
    assert.equal(signupResponse.status, 200);
    const signupBody = await signupResponse.json() as { user: { id: string } };
    founderId = signupBody.user.id;
    const signupSessionCookie = signupResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(signupSessionCookie, "Founder bootstrap must use a real Better Auth session cookie");

    await prisma.user.update({ where: { id: founderId }, data: { emailVerified: true } });
    const enrollmentHeaders = new Headers({ cookie: signupSessionCookie });
    const enrollment = await auth.api.enableTwoFactor({
      body: { password: "CI-only-strong-password-123!", method: "totp", issuer: "MERIT" },
      headers: enrollmentHeaders,
    }) as { method: "totp"; totpURI: string; backupCodes: string[] };
    assert.equal(enrollment.method, "totp");
    const founderTotpSecret = new URL(enrollment.totpURI).searchParams.get("secret");
    assert.ok(founderTotpSecret);
    const enrollmentVerification = await auth.api.verifyTOTP({
      body: { code: currentTotp(founderTotpSecret), trustDevice: false },
      headers: enrollmentHeaders,
      asResponse: true,
    });
    assert.equal(enrollmentVerification.status, 200);
    const founderSessionCookie = await signInWithTotp(
      founderEmail,
      "CI-only-strong-password-123!",
      founderTotpSecret,
    );
    const founderHeaders = {
      cookie: founderSessionCookie,
      origin: "https://merit-olive.vercel.app",
      "content-type": "application/json",
      "user-agent": "MERIT-CI-Integration-Test",
    };
    const bootstrapRequest = () => new Request(
      "https://merit-olive.vercel.app/api/platform/bootstrap",
      {
        method: "POST",
        headers: founderHeaders,
        body: JSON.stringify({ bootstrapSecret }),
      },
    );

    const bootstrapResponse = await founderBootstrapPost(bootstrapRequest());
    assert.equal(bootstrapResponse.status, 200, "verified signed-in account with the one-time secret should bootstrap");
    const bootstrapBody = await bootstrapResponse.json() as { success: boolean; role: string };
    assert.equal(bootstrapBody.success, true);
    assert.equal(bootstrapBody.role, "FOUNDER_SUPER_ADMIN");

    const founderAccess = await prisma.platformAccess.findUniqueOrThrow({ where: { userId: founderId } });
    assert.equal(founderAccess.role, PlatformAccessRole.FOUNDER_SUPER_ADMIN);
    assert.equal(founderAccess.revokedAt, null);
    await assert.rejects(
      prisma.user.delete({ where: { id: founderId } }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      "a Founder account cannot be deleted while its platform governance record exists",
    );
    assert.equal(await prisma.securityEvent.count({
      where: { actorUserId: founderId, targetId: founderId, type: "FOUNDER_SUPER_ADMIN_BOOTSTRAPPED" },
    }), 1);

    assert.equal(
      (await founderBootstrapPost(bootstrapRequest())).status,
      409,
      "bootstrap must be one-time, including repeated use by the original founder",
    );
    assert.equal(
      (await founderBootstrapPost(new Request("https://merit-olive.vercel.app/api/platform/bootstrap", {
        method: "POST",
        headers: { ...founderHeaders, origin: "https://attacker.example" },
        body: JSON.stringify({ bootstrapSecret }),
      }))).status,
      403,
      "bootstrap must reject cross-origin requests",
    );

    const target = await prisma.user.create({
      data: {
        id: `ci-platform-target-${suffix}`,
        name: "CI Platform Target",
        email: targetEmail,
        emailVerified: true,
      },
    });
    targetId = target.id;
    const unverified = await prisma.user.create({
      data: {
        id: `ci-platform-unverified-${suffix}`,
        name: "CI Unverified Target",
        email: unverifiedEmail,
        emailVerified: false,
      },
    });
    unverifiedId = unverified.id;

    const grantRequest = (payload: unknown, origin = "https://merit-olive.vercel.app") => new Request(
      "https://merit-olive.vercel.app/api/platform/operators",
      {
        method: "POST",
        headers: { ...founderHeaders, origin },
        body: JSON.stringify(payload),
      },
    );
    const revokeRequest = (payload: unknown) => new Request(
      "https://merit-olive.vercel.app/api/platform/operators",
      {
        method: "DELETE",
        headers: founderHeaders,
        body: JSON.stringify(payload),
      },
    );

    assert.equal((await grantPlatformOperator(grantRequest({
      email: "missing-account@example.invalid",
      role: "ENGINEER",
    }))).status, 404);
    assert.equal((await grantPlatformOperator(grantRequest({
      email: unverifiedEmail,
      role: "ENGINEER",
    }))).status, 409, "unverified accounts must not receive platform access");
    assert.equal((await grantPlatformOperator(grantRequest({
      email: targetEmail,
      role: "FOUNDER_SUPER_ADMIN",
    }))).status, 400, "operator grants must not accept the Founder role");
    assert.equal((await grantPlatformOperator(grantRequest({
      email: targetEmail,
      role: "ENGINEER",
    }, "https://attacker.example"))).status, 403, "operator grant must enforce same-origin");

    const grantResponse = await grantPlatformOperator(grantRequest({
      email: targetEmail,
      role: "ENGINEER",
    }));
    assert.equal(grantResponse.status, 201);
    const granted = await prisma.platformAccess.findUniqueOrThrow({ where: { userId: targetId } });
    assert.equal(granted.role, PlatformAccessRole.ENGINEER);
    assert.equal(granted.grantedByUserId, founderId);
    assert.equal(granted.revokedAt, null);
    assert.equal(await prisma.securityEvent.count({
      where: { actorUserId: founderId, targetId, type: "PLATFORM_ACCESS_GRANTED" },
    }), 1);

    assert.equal((await grantPlatformOperator(grantRequest({
      email: targetEmail,
      role: "PLATFORM_ADMIN",
    }))).status, 409, "an already-active operator must not be silently overwritten");

    assert.equal((await revokePlatformOperator(revokeRequest({ userId: founderId }))).status, 409,
      "Founder must not be able to revoke their own Founder access through operator management");
    assert.equal((await revokePlatformOperator(revokeRequest({ userId: targetId }))).status, 200);
    const revoked = await prisma.platformAccess.findUniqueOrThrow({ where: { userId: targetId } });
    assert.ok(revoked.revokedAt, "operator revocation must persist");
    assert.equal(await prisma.securityEvent.count({
      where: { actorUserId: founderId, targetId, type: "PLATFORM_ACCESS_REVOKED" },
    }), 1);
    assert.equal((await revokePlatformOperator(revokeRequest({ userId: targetId }))).status, 409,
      "repeat revocation must be rejected");

    const reinstatedResponse = await grantPlatformOperator(grantRequest({
      email: targetEmail,
      role: "PLATFORM_ADMIN",
    }));
    assert.equal(reinstatedResponse.status, 201, "Founder must be able to reinstate a revoked operator");
    const reinstated = await prisma.platformAccess.findUniqueOrThrow({ where: { userId: targetId } });
    assert.equal(reinstated.role, PlatformAccessRole.PLATFORM_ADMIN);
    assert.equal(reinstated.revokedAt, null);
    assert.equal(await prisma.securityEvent.count({
      where: { actorUserId: founderId, targetId, type: "PLATFORM_ACCESS_REINSTATED" },
    }), 1);

    assert.equal((await revokePlatformOperator(revokeRequest({ userId: "missing-platform-user" }))).status, 404);
  } finally {
    // Remove CI-only platform records explicitly before deleting test accounts.
    await prisma.platformAccess.deleteMany({ where: { userId: { in: [founderId, targetId].filter(Boolean) } } }).catch(() => undefined);
    if (founderId) await prisma.user.delete({ where: { id: founderId } }).catch(() => undefined);
    if (targetId) await prisma.user.delete({ where: { id: targetId } }).catch(() => undefined);
    if (unverifiedId) await prisma.user.delete({ where: { id: unverifiedId } }).catch(() => undefined);
    if (previousSecret === undefined) delete process.env.FOUNDER_BOOTSTRAP_SECRET;
    else process.env.FOUNDER_BOOTSTRAP_SECRET = previousSecret;
    if (previousFounderEmail === undefined) delete process.env.FOUNDER_BOOTSTRAP_EMAIL;
    else process.env.FOUNDER_BOOTSTRAP_EMAIL = previousFounderEmail;
  }
});
