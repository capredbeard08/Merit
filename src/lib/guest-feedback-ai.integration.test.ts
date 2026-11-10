import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { POST as analyzeGuestFeedback } from "../app/api/guest-feedback/ai-insights/route";
import { auth } from "./better-auth";

const prisma = new PrismaClient();
const originalFetch = globalThis.fetch;
const originalGroqKey = process.env.GROQ_API_KEY;

function request(cookie: string, body: unknown) {
  return analyzeGuestFeedback(new Request("https://merit-olive.vercel.app/api/guest-feedback/ai-insights", {
    method: "POST",
    headers: {
      cookie,
      origin: "https://merit-olive.vercel.app",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

test("Groq feedback analysis requires explicit consent, workspace permission, and a content-free audit trail", async () => {
  const suffix = randomUUID();
  let userId = "";
  let workspaceId = "";
  const email = "ai-" + suffix + "@example.invalid";
  let requestInit: RequestInit | undefined;
  let providerCalls = 0;

  process.env.GROQ_API_KEY = "ci-groq-test-key";
  globalThis.fetch = (async (_input, init) => {
    providerCalls += 1;
    requestInit = init;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        themes: [{
          name: "Service",
          sentiment: "positive",
          mentions: 1,
          summary: "One guest praised the service.",
          suggestedAction: "Maintain the current service standard.",
        }],
        overallSummary: "Written feedback is positive about service.",
        priority: "Continue monitoring service consistency.",
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const signup = await auth.api.signUpEmail({
      body: { name: "AI Integration Operator", email, password: "CI-only-strong-password-123!" },
      asResponse: true,
    });
    assert.equal(signup.status, 200);
    const signupBody = await signup.json() as { user: { id: string } };
    userId = signupBody.user.id;
    const cookie = signup.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const workspace = await prisma.workspace.create({ data: { name: "AI Consent Test " + suffix } });
    workspaceId = workspace.id;
    await prisma.member.create({
      data: { workspaceId, userId, email, role: "OWNER" },
    });
    const branch = await prisma.branch.create({ data: { workspaceId, name: "AI Test Branch" } });
    const qr = await prisma.guestQrCode.create({
      data: {
        workspaceId,
        branchId: branch.id,
        publicId: randomBytes(24).toString("base64url"),
      },
    });
    const rawComment = "Great service. Contact me at guest@example.com or +234 801 234 5678";
    await prisma.guestFeedback.create({
      data: {
        workspaceId,
        branchId: branch.id,
        qrCodeId: qr.id,
        rating: "FIVE",
        message: rawComment,
      },
    });

    const noConsent = await request(cookie!, { workspaceId });
    assert.equal(noConsent.status, 428, "external processing must require an explicit per-request confirmation");
    assert.equal(providerCalls, 0, "no comment may leave MERIT before consent");

    await prisma.member.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: "VIEWER" },
    });
    const denied = await request(cookie!, { workspaceId, confirmExternalProcessing: true });
    assert.equal(denied.status, 403, "a workspace role without ai:use must be denied");
    assert.equal(providerCalls, 0);

    await prisma.member.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: "OWNER" },
    });
    const accepted = await request(cookie!, { workspaceId, confirmExternalProcessing: true });
    assert.equal(accepted.status, 200);
    assert.equal(providerCalls, 1);
    const body = JSON.parse(String(requestInit?.body));
    const submitted = JSON.parse(body.messages[1].content).feedback;
    assert.equal(submitted.length, 1);
    assert.match(submitted[0].message, /\[email\]/);
    assert.match(submitted[0].message, /\[phone\]/);
    assert.equal(JSON.stringify(body).includes("guest@example.com"), false);
    assert.equal(JSON.stringify(body).includes(workspaceId), false);
    assert.equal(JSON.stringify(body).includes(userId), false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { workspaceId, actorUserId: userId, action: "GUEST_FEEDBACK_AI_ANALYSIS_REQUESTED" },
      orderBy: { createdAt: "desc" },
    });
    const auditText = JSON.stringify(audit.metadata);
    assert.equal(auditText.includes(rawComment), false);
    assert.equal(auditText.includes("guest@example.com"), false);
    assert.match(auditText, /PATTERN_REDACTION_NOT_ANONYMIZATION/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (workspaceId) {
      await prisma.auditLog.deleteMany({ where: { workspaceId } });
      await prisma.member.deleteMany({ where: { workspaceId } });
      await prisma.guestFeedback.deleteMany({ where: { workspaceId } });
      await prisma.guestQrCode.deleteMany({ where: { workspaceId } });
      await prisma.branch.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  }
});
