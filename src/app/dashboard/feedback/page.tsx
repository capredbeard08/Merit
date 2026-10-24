import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import DashboardSidebar from "@/components/DashboardSidebar";
import FeedbackInbox from "./FeedbackInbox";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/auth");

  const workspaceId = membership.workspaceId;
  const [records, pending, reviewing, resolved, closed] = await Promise.all([
    prisma.feedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        sentAt: true,
        clickedAt: true,
        repliedAt: true,
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, rating: true, message: true, createdAt: true },
        },
      },
    }),
    prisma.feedback.count({ where: { workspaceId, status: "PENDING" } }),
    prisma.feedback.count({ where: { workspaceId, status: { in: ["CONTACTED", "CLICKED", "REPLIED"] } } }),
    prisma.feedback.count({ where: { workspaceId, status: "RESOLVED" } }),
    prisma.feedback.count({ where: { workspaceId, status: "OPTED_OUT" } }),
  ]);

  return (
    <div className="min-h-screen bg-[#fbfcfb] text-[#14231c]">
      <DashboardSidebar workspaceName={membership.workspace.name} userName={session.user.name || session.user.email} active="feedback" />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-9 md:ml-[234px] md:py-7">
        <header className="flex flex-col gap-5 border-b border-[#e4eae6] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Feedback</h1>
            <p className="mt-1 text-base text-[#64746c]">Customer feedback from completed services.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/dashboard#action-inbox" className="inline-flex items-center gap-2 rounded-xl border border-[#d9e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#243b30] hover:bg-[#f3f8f5]">↗ Get feedback</a>
            <a href="/dashboard#action-inbox" className="inline-flex items-center gap-2 rounded-xl border border-[#d9e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#243b30] hover:bg-[#f3f8f5]">☷ View activity</a>
          </div>
        </header>
        <section className="mt-6">
          <p className="text-sm text-[#64746c]">Workspace <span className="font-semibold text-[#1e4032]">{membership.workspace.name}</span></p>
          <FeedbackInbox
            workspaceId={workspaceId}
            initialItems={records.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), sentAt: item.sentAt?.toISOString() || null, clickedAt: item.clickedAt?.toISOString() || null, repliedAt: item.repliedAt?.toISOString() || null, replies: item.replies.map((reply) => ({ ...reply, createdAt: reply.createdAt.toISOString() })) }))}
            counts={{ new: pending, reviewing, resolved, closed }}
          />
        </section>
      </main>
    </div>
  );
}
