import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function validToken(id: string, token: unknown): token is string {
  return typeof token === "string" && token.length <= 256 && verifyFeedbackToken(id, token);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!validToken(id, token)) {
    return NextResponse.json({ error: "Invalid opt-out link" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback request not found" }, { status: 404 });

  // Email security scanners commonly prefetch GET links. Opening this page
  // must never change customer consent; the customer must submit the form.
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirm email opt-out</title></head>
<body>
  <main>
    <h1>Stop feedback emails?</h1>
    <p>Confirm below if you no longer want feedback requests from this business.</p>
    <form method="post" action="">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Confirm opt-out</button>
    </form>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  let token: unknown;
  try {
    const form = await request.formData();
    token = form.get("token");
  } catch {
    return NextResponse.json({ error: "A valid opt-out confirmation is required" }, { status: 400 });
  }

  if (!validToken(id, token)) {
    return NextResponse.json({ error: "Invalid opt-out link" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, customerId: true },
  });
  if (!feedback) return NextResponse.json({ error: "Feedback request not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: feedback.customerId },
      data: { optedOutAt: new Date() },
    }),
    prisma.feedback.update({
      where: { id },
      data: { status: "OPTED_OUT" },
    }),
    prisma.followUp.updateMany({
      where: { feedbackId: id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "CANCELLED", processingAt: null },
    }),
  ]);

  return NextResponse.redirect(new URL("/feedback/" + id + "/opted-out", request.url), 303);
}
