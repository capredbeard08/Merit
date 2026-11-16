import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGuestFeedbackThemes } from "./groq";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GROQ_API_KEY;
const originalModel = process.env.GROQ_MODEL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = originalModel;
});

test("returns a neutral result without a provider call when there are no comments", async () => {
  delete process.env.GROQ_API_KEY;
  const result = await analyzeGuestFeedbackThemes([]);
  assert.equal(result.themes.length, 0);
  assert.match(result.overallSummary, /not enough written feedback/i);
});

test("sends bounded, redacted feedback to Groq and validates the response", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      themes: [{ name: "Service", sentiment: "positive", mentions: 1, summary: "Guests appreciated the service.", suggestedAction: "Maintain the current service standard." }],
      overallSummary: "Written feedback is positive about service.",
      priority: "Continue monitoring service consistency.",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const result = await analyzeGuestFeedbackThemes([
    { rating: 5, message: "Great service. Contact me at guest@example.com or +234 801 234 5678" },
  ]);
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(requestUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer test-groq-key");
  assert.equal(body.model, "openai/gpt-oss-120b");
  assert.match(body.messages[1].content, /\[email\]/);
  assert.match(body.messages[1].content, /\[phone\]/);
  assert.equal(body.messages[1].content.includes("guest@example.com"), false);
  assert.equal(result.themes[0].name, "Service");
});

test("rejects malformed model output and provider errors without leaking provider details", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "private provider detail" }), { status: 429 })) as typeof fetch;
  await assert.rejects(
    analyzeGuestFeedbackThemes([{ rating: 2, message: "Slow service" }]),
    (error: unknown) => error instanceof Error && error.message === "AI analysis is temporarily unavailable",
  );
});


test("redacts URLs, caps each message, and sends no more than 100 entries", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  let requestBody: any;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      themes: [{ name: "Service", sentiment: "mixed", mentions: 100, summary: "Guests gave mixed comments about service.", suggestedAction: "Review the service process with the team." }],
      overallSummary: "Feedback contains a mixture of service experiences.",
      priority: "Review recurring service concerns.",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await analyzeGuestFeedbackThemes(Array.from({ length: 105 }, (_, index) => ({
    rating: 5,
    message: index === 0
      ? "Visit https://example.com/private?token=secret " + "x".repeat(1400)
      : "Useful feedback " + index,
  })));

  const sent = JSON.parse(requestBody.messages[1].content).feedback;
  assert.equal(sent.length, 100);
  assert.equal(sent[0].message, "Visit [link] " + "x".repeat(1187));
  assert.equal(sent[0].message.includes("secret"), false);
  assert.ok(sent[0].message.length <= 1200);
});

test("filters invalid ratings before sending feedback to the provider", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  let requestBody: any;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      themes: [{ name: "Cleanliness", sentiment: "positive", mentions: 1, summary: "One guest praised cleanliness.", suggestedAction: "Maintain current standards." }],
      overallSummary: "The valid feedback is positive about cleanliness.",
      priority: "Continue monitoring cleanliness.",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await analyzeGuestFeedbackThemes([
    { rating: 0, message: "Invalid rating should not be sent" },
    { rating: 6, message: "Invalid rating should not be sent either" },
    { rating: 5, message: "Clean and welcoming" },
  ]);

  const sent = JSON.parse(requestBody.messages[1].content).feedback;
  assert.deepEqual(sent, [{ rating: 5, message: "Clean and welcoming" }]);
});

test("redacts www and mailto links before sending comments externally", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  let requestBody: any;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      themes: [],
      overallSummary: "There is not enough detail to identify a clear theme.",
      priority: "Collect more feedback before taking action.",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await analyzeGuestFeedbackThemes([{ rating: 4, message: "See www.example.com or mailto:guest@example.com for details." }]);
  const sent = JSON.parse(requestBody.messages[1].content).feedback[0].message;
  assert.equal(sent, "See [link] or [link] for details.");
});

test("redacts complete redirect URLs and bare multi-level hostnames", async () => {
  process.env.GROQ_API_KEY = "test-groq-key";
  let requestBody: any;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      themes: [],
      overallSummary: "There is not enough detail to identify a clear theme.",
      priority: "Collect more feedback before taking action.",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await analyzeGuestFeedbackThemes([{
    rating: 4,
    message: "Visit https://redirect.example.net/path/www.example.com/after.evil or sub.example.co.uk/path?next=evil.com",
  }]);

  const sent = JSON.parse(requestBody.messages[1].content).feedback[0].message;
  assert.equal(sent, "Visit [link] or [link]");
});
