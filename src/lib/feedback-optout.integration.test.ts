import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { GET as getOptOut, POST as postOptOut } from "../app/api/feedback/[id]/optout/route";
import { createFeedbackToken } from "./feedback-token";

const prisma = new PrismaClient();
const originalAuthSecret = process.env.AUTH_SECRET;
const originalFeedbackSecret = process.env.FEEDBACK_TOKEN_SECRET;
const originalPreviousSecrets = process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS;
process.env.AUTH_SECRET = "feedback-optout-integration-test-secret-not-production";
delete process.env.FEEDBACK_TOKEN_SECRET;
delete process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS;

test.after(async () => {
  await prisma.$disconnect();
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  if (originalFeedbackSecret === undefined) delete process.env.FEEDBACK_TOKEN_SECRET;
  else process.env.FEEDBACK_TOKEN_SECRET = originalFeedbackSecret;
  if (originalPreviousSecrets === undefined) delete process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS;
  else process.env.FEEDBACK_TOKEN_PREVIOUS_SECRETS = originalPreviousSecrets;
});

test("public feedback opt-out requires a valid signed capability and changes consent only on POST", async () => {
  const suffix = randomUUID();
  const workspace = await prisma.workspace.create({ data: { name: "Opt-out security test " + suffix } });

  try {
    const branch = await prisma.branch.create({
      data: { workspaceId: workspace.id, name: "Opt-out branch" },
    });
    const customer = await prisma.customer.create({
      data: { workspaceId: workspace.id, externalId: "optout-" + suffix },
    });
    const sentAt = new Date();
    const serviceEvent = await prisma.serviceEvent.create({
      data: {
        workspaceId: workspace.id,
        branchId: branch.id,
        customerId: customer.id,
        completedAt: sentAt,
      },
    });
    const feedback = await prisma.feedback.create({
      data: {
        workspaceId: workspace.id,
        branchId: branch.id,
        customerId: customer.id,
        serviceEventId: serviceEvent.id,
        sentAt,
      },
    });
    const token = createFeedbackToken(feedback.id, Math.floor(sentAt.getTime() / 1000));
    const url = "https://merit-olive.vercel.app/api/feedback/" + feedback.id + "/optout?t=" + encodeURIComponent(token);
    const context = { params: Promise.resolve({ id: feedback.id }) };

    const confirmationPage = await getOptOut(new Request(url), context);
    assert.equal(confirmationPage.status, 200);
    assert.match(await confirmationPage.text(), /Confirm opt-out/);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).optedOutAt, null);
    assert.equal((await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } })).status, "PENDING",
      "GET must never change consent, even when it contains a valid capability");

    const invalidResponse = await postOptOut(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token + "tampered" }),
    }), context);
    assert.equal(invalidResponse.status, 400);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).optedOutAt, null);
    assert.equal((await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } })).status, "PENDING",
      "an invalid or tampered capability must not change customer consent or feedback state");

    const validResponse = await postOptOut(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }), context);
    assert.equal(validResponse.status, 303);

    const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const updatedFeedback = await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    assert.ok(updatedCustomer.optedOutAt);
    assert.equal(updatedFeedback.status, "OPTED_OUT");
    assert.equal(await prisma.auditLog.count({
      where: {
        workspaceId: workspace.id,
        action: "CUSTOMER_OPTED_OUT",
        targetId: customer.id,
      },
    }), 1, "a successful public opt-out must create exactly one audit event");
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
});
