import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

const themes: Record<string, string[]> = {
  service: ["service", "staff", "team", "employee", "helpful", "rude"],
  speed: ["slow", "fast", "wait", "waiting", "delay", "quick"],
  quality: ["quality", "good", "great", "bad", "poor", "excellent"],
  price: ["price", "expensive", "cheap", "cost", "value"],
};

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const replies = await prisma.feedbackReply.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: { rating: true, message: true, createdAt: true },
  });

  if (!replies.length) return NextResponse.json({ generated: 0, message: "Not enough feedback yet." });

  const ratingValues: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const rated = replies.filter((item) => item.rating);
  const average = rated.length ? rated.reduce((sum, item) => sum + (ratingValues[item.rating!] || 0), 0) / rated.length : 0;
  const text = replies.map((item) => item.message || "").join(" ").toLowerCase();

  const ranked = Object.entries(themes)
    .map(([theme, words]) => ({
      theme,
      mentions: words.reduce((count, word) => count + text.split(word).length - 1, 0),
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .filter((item) => item.mentions > 0)
    .slice(0, 3);

  const summary = average
    ? "Average customer rating is " + average.toFixed(1) + "/5 across " + rated.length + " rated responses."
    : "Customers have submitted " + replies.length + " written responses.";

  const insight = await prisma.insight.create({
    data: {
      workspaceId: membership.workspaceId,
      kind: "FEEDBACK_SUMMARY",
      title: "Latest customer signal",
      summary,
      evidence: { responseCount: replies.length, averageRating: average, themes: ranked },
    },
  });

  return NextResponse.json({ generated: 1, insight });
}
