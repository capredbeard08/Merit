import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { POST as submitGuestFeedback } from "../app/api/public/guest-feedback/[publicId]/route";
import { GET as getGuestFeedback, POST as createGuestFeedback, PATCH as updateGuestFeedback } from "../app/api/guest-feedback/route";
import { auth } from "./better-auth";

const prisma = new PrismaClient();

function publicId(): string {
  return randomBytes(24).toString("base64url");
}

function submit(publicIdValue: string, submissionKey = randomUUID(), ip = "198.51.100.10") {
  return submitGuestFeedback(
    new Request("https://merit-olive.vercel.app/api/public/guest-feedback/" + publicIdValue, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ rating: 5, submissionKey }),
    }),
    { params: Promise.resolve({ publicId: publicIdValue }) },
  );
}

function submitRaw(publicIdValue: string, body: string, ip = "198.51.100.60") {
  return submitGuestFeedback(
    new Request("https://merit-olive.vercel.app/api/public/guest-feedback/" + publicIdValue, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body,
    }),
    { params: Promise.resolve({ publicId: publicIdValue }) },
  );
}

test("guest feedback composite foreign keys reject cross-workspace and cross-branch references", async () => {
  const suffix = randomUUID();
  const workspaceA = await prisma.workspace.create({ data: { name: "Guest tenant A " + suffix } });
  const workspaceB = await prisma.workspace.create({ data: { name: "Guest tenant B " + suffix } });

  try {
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { workspaceId: workspaceA.id, name: "Branch A" } }),
      prisma.branch.create({ data: { workspaceId: workspaceB.id, name: "Branch B" } }),
    ]);
    const qrA = await prisma.guestQrCode.create({
      data: { workspaceId: workspaceA.id, branchId: branchA.id, publicId: publicId() },
    });
    const qrB = await prisma.guestQrCode.create({
      data: { workspaceId: workspaceB.id, branchId: branchB.id, publicId: publicId() },
    });

    await assert.rejects(
      prisma.guestQrCode.create({
        data: { workspaceId: workspaceA.id, branchId: branchB.id, publicId: publicId() },
      }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      "a QR code must not attach a branch owned by another workspace",
    );

    await assert.rejects(
      prisma.guestFeedback.create({
        data: {
          workspaceId: workspaceA.id,
          branchId: branchB.id,
          qrCodeId: qrA.id,
          rating: "FIVE",
        },
      }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      "guest feedback must not pair a workspace with another workspace's branch",
    );

    await assert.rejects(
      prisma.guestFeedback.create({
        data: {
          workspaceId: workspaceA.id,
          branchId: branchA.id,
          qrCodeId: qrB.id,
          rating: "FIVE",
        },
      }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      "guest feedback must not reference a QR code from another workspace or branch",
    );

    const validFeedback = await prisma.guestFeedback.create({
      data: {
        workspaceId: workspaceA.id,
        branchId: branchA.id,
        qrCodeId: qrA.id,
        rating: "FIVE",
      },
    });

    await assert.rejects(
      prisma.guestQrCode.update({
        where: { id: qrA.id },
        data: { workspaceId: workspaceB.id, branchId: branchB.id },
      }),
      "guest QR workspace ownership must be immutable even when the destination branch is valid",
    );
    await assert.rejects(
      prisma.guestFeedback.update({
        where: { id: validFeedback.id },
        data: { workspaceId: workspaceB.id, branchId: branchB.id, qrCodeId: qrB.id },
      }),
      "guest feedback workspace ownership must be immutable even when destination relations are valid",
    );
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
  }
});

test("public guest feedback handles idempotency, rate limits, and QR lifecycle safely", async () => {
  const suffix = randomUUID();
  const workspace = await prisma.workspace.create({ data: { name: "Guest route test " + suffix } });

  try {
    const branch = await prisma.branch.create({
      data: { workspaceId: workspace.id, name: "Guest route branch" },
    });
    const qr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId() },
    });

    const key = randomUUID();
    const first = await submit(qr.publicId, key, "198.51.100.20");
    const duplicate = await submit(qr.publicId, key, "198.51.100.20");
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal((await first.json() as { accepted: boolean }).accepted, true);
    assert.equal((await duplicate.json() as { accepted: boolean }).accepted, true);
    assert.equal(await prisma.guestFeedback.count({ where: { qrCodeId: qr.id } }), 1,
      "retries with the same idempotency key must create one record");

    const limitedQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId() },
    });
    const responses = [];
    for (let i = 0; i < 6; i += 1) {
      responses.push(await submit(limitedQr.publicId, randomUUID(), "198.51.100.30"));
    }
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200, 429]);
    const rateLimitEvent = await prisma.securityEvent.findFirst({
      where: { workspaceId: workspace.id, targetId: limitedQr.id, type: "RATE_LIMIT_TRIGGERED" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(rateLimitEvent, "rate-limited guest submissions must create a security event");
    assert.deepEqual(rateLimitEvent.metadata, {
      route: "public_guest_feedback",
      limiter: "ip",
      severity: "MEDIUM",
    });
    assert.equal(rateLimitEvent.ipAddress, "198.51.100.30");
    assert.equal(JSON.stringify(rateLimitEvent.metadata).includes("submissionKey"), false,
      "security metadata must not contain raw idempotency keys or guest content");

    const pausedQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId(), status: "PAUSED" },
    });
    assert.equal((await submit(pausedQr.publicId, randomUUID(), "198.51.100.40")).status, 404,
      "paused QR codes must reject submissions");

    const revokedQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId(), status: "REVOKED" },
    });
    assert.equal((await submit(revokedQr.publicId, randomUUID(), "198.51.100.41")).status, 404,
      "revoked QR codes must reject submissions");

    assert.equal((await submitRaw(qr.publicId, "{invalid-json", "198.51.100.42")).status, 400,
      "malformed JSON must receive a bounded validation response");
    const wrongContentType = await submitGuestFeedback(
      new Request("https://merit-olive.vercel.app/api/public/guest-feedback/" + qr.publicId, {
        method: "POST",
        headers: { "content-type": "text/plain", "x-real-ip": "198.51.100.47" },
        body: JSON.stringify({ rating: 5, submissionKey: randomUUID() }),
      }),
      { params: Promise.resolve({ publicId: qr.publicId }) },
    );
    assert.equal(wrongContentType.status, 415, "public submissions must require JSON content type");
    const oversizedBody = await submitRaw(qr.publicId, JSON.stringify({
      rating: 5, message: "x".repeat(5000), submissionKey: randomUUID(),
    }), "198.51.100.48");
    assert.equal(oversizedBody.status, 413, "raw request bodies must be bounded before JSON parsing");
    assert.equal((await submitRaw(qr.publicId, JSON.stringify({
      rating: 6, submissionKey: randomUUID(),
    }), "198.51.100.43")).status, 400,
      "ratings outside the one-to-five range must be rejected");
    assert.equal((await submitRaw(qr.publicId, JSON.stringify({
      rating: 5, message: "x".repeat(2001), submissionKey: randomUUID(),
    }), "198.51.100.44")).status, 400,
      "oversized comments must be rejected");

    const hostileText = "<script>alert(1)</script>";
    const hostileResponse = await submitRaw(qr.publicId, JSON.stringify({
      rating: 4, message: hostileText, submissionKey: randomUUID(),
    }), "198.51.100.46");
    assert.equal(hostileResponse.status, 200);
    const storedHostileText = await prisma.guestFeedback.findFirstOrThrow({
      where: { qrCodeId: qr.id, message: hostileText },
    });
    assert.equal(storedHostileText.message, hostileText,
      "hostile-looking feedback is stored as plain text and must be rendered as text by React");

    const staleQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId(), status: "PAUSED" },
    });
    const staleSnapshot = await prisma.guestQrCode.findUniqueOrThrow({
      where: { id: staleQr.id }, select: { status: true },
    });
    await prisma.guestQrCode.update({ where: { id: staleQr.id }, data: { status: "REVOKED" } });
    const staleReactivation = await prisma.guestQrCode.updateMany({
      where: { id: staleQr.id, workspaceId: workspace.id, status: staleSnapshot.status },
      data: { status: "ACTIVE" },
    });
    assert.equal(staleReactivation.count, 0,
      "a stale reactivation write must not overwrite a committed revocation");
    assert.equal((await prisma.guestQrCode.findUniqueOrThrow({ where: { id: staleQr.id } })).status, "REVOKED");

    const raceQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: branch.id, publicId: publicId() },
    });
    let releaseLifecycleLock!: () => void;
    let lifecycleLockAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => { lifecycleLockAcquired = resolve; });
    const releaseLock = new Promise<void>((resolve) => { releaseLifecycleLock = resolve; });
    const pauseTransaction = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GuestQrCode" WHERE "id" = ${raceQr.id} FOR UPDATE`);
      lifecycleLockAcquired();
      await releaseLock;
      await tx.guestQrCode.update({ where: { id: raceQr.id }, data: { status: "PAUSED" } });
    });
    await lockAcquired;
    const racingSubmission = submit(raceQr.publicId, randomUUID(), "198.51.100.45");
    await new Promise((resolve) => setTimeout(resolve, 150));
    releaseLifecycleLock();
    await pauseTransaction;
    assert.equal((await racingSubmission).status, 404,
      "a submission waiting behind a committed pause must be rejected after the row lock is released");
    assert.equal(await prisma.guestFeedback.count({ where: { qrCodeId: raceQr.id } }), 0,
      "a submission serialized after pause must not create guest feedback");

    const archivedBranch = await prisma.branch.create({
      data: { workspaceId: workspace.id, name: "Archived guest branch", archivedAt: new Date() },
    });
    const archivedQr = await prisma.guestQrCode.create({
      data: { workspaceId: workspace.id, branchId: archivedBranch.id, publicId: publicId() },
    });
    assert.equal((await submit(archivedQr.publicId, randomUUID(), "198.51.100.50")).status, 404,
      "QR codes attached to archived branches must reject submissions");
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
});


test("authenticated guest-feedback APIs enforce workspace membership and scope returned data", async () => {
  const suffix = randomUUID();
  const email = `tenant-owner-${suffix}@example.invalid`;
  const signup = await auth.api.signUpEmail({
    body: { name: "Tenant Isolation CI", email, password: "CI-only-strong-password-123!" },
    asResponse: true,
  });
  assert.equal(signup.status, 200);
  const signupBody = await signup.json() as { user: { id: string } };
  const userId = signupBody.user.id;
  const sessionCookie = signup.headers.get("set-cookie")?.split(";")[0];
  assert.ok(sessionCookie, "Better Auth must issue a signed session cookie");

  const [workspaceA, workspaceB] = await Promise.all([
    prisma.workspace.create({ data: { name: `Tenant API A ${suffix}` } }),
    prisma.workspace.create({ data: { name: `Tenant API B ${suffix}` } }),
  ]);

  try {
    await prisma.member.create({
      data: { workspaceId: workspaceA.id, userId, email, role: "OWNER" },
    });
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { workspaceId: workspaceA.id, name: "Authorized branch" } }),
      prisma.branch.create({ data: { workspaceId: workspaceB.id, name: "Foreign branch" } }),
    ]);
    const [qrA, qrB] = await Promise.all([
      prisma.guestQrCode.create({ data: { workspaceId: workspaceA.id, branchId: branchA.id, publicId: publicId() } }),
      prisma.guestQrCode.create({ data: { workspaceId: workspaceB.id, branchId: branchB.id, publicId: publicId() } }),
    ]);

    const headers = {
      cookie: sessionCookie,
      origin: "https://merit-olive.vercel.app",
      "content-type": "application/json",
    };
    const getWorkspace = (workspaceId: string) => new Request(
      `https://merit-olive.vercel.app/api/guest-feedback?workspaceId=${workspaceId}`,
      { headers },
    );

    const ownRead = await getGuestFeedback(getWorkspace(workspaceA.id));
    assert.equal(ownRead.status, 200);
    const ownBody = await ownRead.json() as { codes: Array<{ id: string; publicId: string }> };
    assert.deepEqual(ownBody.codes.map((code) => code.id), [qrA.id]);
    assert.equal(ownBody.codes.some((code) => code.publicId === qrB.publicId), false,
      "a workspace response must never include another workspace's QR code");

    const foreignRead = await getGuestFeedback(getWorkspace(workspaceB.id));
    assert.equal(foreignRead.status, 403,
      "a signed-in user without membership must not read another workspace");

    const foreignCreate = await createGuestFeedback(new Request(
      "https://merit-olive.vercel.app/api/guest-feedback",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId: workspaceB.id, branchId: branchB.id, label: "Cross-tenant attempt" }),
      },
    ));
    assert.equal(foreignCreate.status, 403,
      "a user must not create a QR code in a workspace they do not belong to");
    assert.equal(await prisma.guestQrCode.count({ where: { workspaceId: workspaceB.id } }), 1,
      "a denied cross-workspace create must not persist a QR code");

    const foreignReviewUpdate = await updateGuestFeedback(new Request(
      "https://merit-olive.vercel.app/api/guest-feedback",
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          workspaceId: workspaceB.id,
          branchId: branchB.id,
          googleReviewUrl: "https://g.page/r/example",
        }),
      },
    ));
    assert.equal(foreignReviewUpdate.status, 403,
      "a user must not change another workspace's review destination");
    assert.equal((await prisma.branch.findUniqueOrThrow({ where: { id: branchB.id } })).googleReviewUrl, null);
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});
