import test from "node:test";
import assert from "node:assert/strict";
import { feedbackEmailHtml, passwordResetEmailHtml, sendEmail } from "./email";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.RESEND_API_KEY;
const originalLegacyApiKey = process.env.EMAIL_PROVIDER_API_KEY;
const originalFrom = process.env.EMAIL_FROM;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
  if (originalLegacyApiKey === undefined) delete process.env.EMAIL_PROVIDER_API_KEY;
  else process.env.EMAIL_PROVIDER_API_KEY = originalLegacyApiKey;
  if (originalFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = originalFrom;
});

test("email transport refuses to send when provider configuration is incomplete", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_PROVIDER_API_KEY;
  delete process.env.EMAIL_FROM;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  await assert.rejects(
    sendEmail({
      to: "person@example.com",
      subject: "Verify",
      html: "<p>Verify</p>",
      idempotencyKey: "verification-test",
    }),
    /Email provider is not configured/,
  );
  assert.equal(called, false);
});

test("email transport sends through Resend with an idempotency key", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "MERIT <ci@example.invalid>";
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ id: "email_test_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await sendEmail({
    to: "person@example.com",
    subject: "Verify your MERIT email address",
    html: "<p>Verify</p>",
    idempotencyKey: "verification-test-key",
  });

  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(result.id, "email_test_123");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer test-resend-key");
  assert.equal(new Headers(requestInit?.headers).get("Idempotency-Key"), "verification-test-key");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    from: "MERIT <ci@example.invalid>",
    to: ["person@example.com"],
    subject: "Verify your MERIT email address",
    html: "<p>Verify</p>",
  });
});

test("email transport surfaces provider rejection without exposing credentials", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "MERIT <ci@example.invalid>";
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ message: "The sender identity is not verified" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;

  await assert.rejects(
    sendEmail({
      to: "person@example.com",
      subject: "Verify",
      html: "<p>Verify</p>",
      idempotencyKey: "verification-rejected",
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "The sender identity is not verified");
      assert.equal(error.message.includes("test-resend-key"), false);
      return true;
    },
  );
});

test("password reset email escapes the link and states the expiry", () => {
  const html = passwordResetEmailHtml('https://example.com/reset?token=a&next="b"');
  assert.ok(html.includes("a&amp;next=&quot;b&quot;"));
  assert.ok(html.includes("expires after one hour"));
  assert.ok(html.includes("Your password will not change unless the link is used"));
});

test("feedback email HTML escapes customer and business-controlled values", () => {
  const html = feedbackEmailHtml({
    customerName: '<script>alert("x")</script>',
    businessName: "A & B <Services>",
    branchName: 'Main "Branch"',
    feedbackUrl: "https://example.com/feedback?a=1&b=2",
    optOutUrl: "https://example.com/opt-out?token=x&next=y",
  });

  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B &lt;Services&gt;"));
  assert.ok(html.includes("Main &quot;Branch&quot;"));
  assert.ok(html.includes("a=1&amp;b=2"));
  assert.ok(html.includes("token=x&amp;next=y"));
});
