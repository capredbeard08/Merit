import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

// Email security scanners routinely prefetch links. A GET must never mutate
// customer or feedback state; actual feedback submission is recorded by POST.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!token || !verifyFeedbackToken(id, token)) {
    return NextResponse.json({ error: "Invalid feedback link" }, { status: 404 });
  }

  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { id: true } });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(appUrl + "/feedback/" + id + "?t=" + encodeURIComponent(token));
}
