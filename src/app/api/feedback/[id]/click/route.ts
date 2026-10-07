import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!token || !verifyFeedbackToken(id, token)) {
    return NextResponse.json({ error: "Invalid feedback link" }, { status: 404 });
  }

  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  await prisma.feedback.update({
    where: { id },
    data: { clickedAt: new Date(), status: feedback.status === "PENDING" || feedback.status === "CONTACTED" ? "CLICKED" : undefined },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(appUrl + "/feedback/" + id + "?t=" + encodeURIComponent(token));
}
