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

function validToken(id: string, token: unknown, sentAt?: Date | null): token is string {
  return typeof token === "string" && token.length <= 512 && verifyFeedbackToken(id, token, sentAt);
}

export async function GET(request: Request, _context: { params: Promise<{ id: string }> }): Promise<Response> {
  // GET only renders a confirmation form. The capability is verified and the
  // consent change occurs exclusively in POST, so email link scanners cannot
  // trigger an opt-out merely by prefetching the URL.
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const formToken = token.slice(0, 512);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirm email opt-out</title></head>
<body>
  <main>
    <h1>Stop feedback emails?</h1>
    <p>Confirm below if you no longer want feedback requests from this business.</p>
    <form method="post" action="">
      <input type="hidden" name="token" value="${escapeHtml(formToken)}">
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
  if (typeof token !== "string" || token.length > 512) {
    return NextResponse.json({ error: "Invalid opt-out link" }, { status: 400 });
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, customerId: true, sentAt: true },
  });
  if (!feedback || !validToken(id, token, feedback.sentAt)) {
    return NextResponse.json({ error: "Invalid or expired opt-out link" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: feedback.customerId, workspaceId: feedback.workspaceId },
      data: { optedOutAt: new Date() },
    });
    await tx.feedback.update({
      where: { id, workspaceId: feedback.workspaceId },
      data: { status: "OPTED_OUT" },
    });
    await tx.followUp.updateMany({
      where: {
        workspaceId: feedback.workspaceId,
        status: { in: ["QUEUED", "PROCESSING"] },
        feedback: { customerId: feedback.customerId },
      },
      data: { status: "CANCELLED", processingAt: null },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: feedback.workspaceId,
        actorUserId: null,
        action: "CUSTOMER_OPTED_OUT",
        targetType: "CUSTOMER",
        targetId: feedback.customerId,
        metadata: { source: "public_feedback_link" },
      },
    });
  });

  return NextResponse.redirect(new URL("/feedback/" + id + "/opted-out", request.url), 303);
}
