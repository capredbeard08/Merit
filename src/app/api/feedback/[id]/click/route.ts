import { NextResponse } from "next/server";
import { verifyFeedbackToken } from "@/lib/feedback-token";

// Email security scanners routinely prefetch links. A GET must never mutate
// customer or feedback state; the actual feedback submission is the meaningful
// customer action and is recorded by the public feedback POST route.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!token || !verifyFeedbackToken(id, token)) {
    return NextResponse.json({ error: "Invalid feedback link" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(appUrl + "/feedback/" + id + "?t=" + encodeURIComponent(token));
}
