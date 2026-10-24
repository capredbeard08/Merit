import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import InboxActions from "./actions";
import BranchManager from "./branches";
import MemberManager from "./members";
import Intelligence from "./intelligence";
import DashboardSidebar from "@/components/DashboardSidebar";
import FileLibrary from "./files";


export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/auth");

  const workspaceId = membership.workspaceId;
  const [feedbackCount, sentCount, pendingCount, repliedCount, completedCount, clickedCount, feedbackReplyCount, recentFeedback, branches, members, insights, replies] = await Promise.all([
    prisma.feedback.count({ where: { workspaceId } }),
    prisma.feedback.count({ where: { workspaceId, sentAt: { not: null } } }),
    prisma.feedback.count({ where: { workspaceId, status: "PENDING" } }),
    prisma.feedback.count({ where: { workspaceId, status: "REPLIED" } }),
    prisma.serviceEvent.count({ where: { workspaceId } }),
    prisma.feedback.count({ where: { workspaceId, clickedAt: { not: null } } }),
    prisma.feedbackReply.count({ where: { workspaceId } }),
    prisma.feedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true, email: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.branch.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true, externalId: true } }),
    prisma.member.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true, name: true } } } }),
    prisma.insight.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.feedbackReply.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        rating: true,
        message: true,
        createdAt: true,
        feedback: {
          select: {
            id: true,
            customer: { select: { name: true, email: true, optedOutAt: true } },
            branch: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const deliveryRate = feedbackCount ? Math.round((sentCount / feedbackCount) * 100) : 0;
  const clickRate = sentCount ? Math.round((clickedCount / sentCount) * 100) : 0;
  const metrics = [
    { label: "Services completed", value: completedCount.toLocaleString(), note: "Completed service events received", mark: "01" },
    { label: "Requests sent", value: sentCount.toLocaleString(), note: feedbackCount + " feedback requests recorded", mark: "02" },
    { label: "Send rate", value: deliveryRate + "%", note: "Sent requests / recorded requests", mark: "03" },
    { label: "Click rate", value: clickRate + "%", note: clickedCount + " review-link clicks recorded", mark: "04" },
    { label: "Feedback received", value: feedbackReplyCount.toLocaleString(), note: repliedCount + " requests marked as replied", mark: "05" },
  ];

  return (
    <div className="min-h-screen bg-[#fbfcfb] text-[#14231c]">
      <DashboardSidebar workspaceName={membership.workspace.name} userName={session.user.name || session.user.email} active="overview" />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-9 md:ml-[234px] md:py-7">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-col gap-5 border-b border-[#e4eae6] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good morning, {session.user.name || session.user.email}</h1>
            <p className="mt-2 text-base text-[#64746c]">Here’s what’s happening with your customer feedback.</p>
            <p className="mt-2 text-sm text-[#6d7c74]">Workspace: <span className="font-semibold text-[#174b3b]">{membership.workspace.name}</span></p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/dashboard#branches" className="inline-flex items-center gap-2 rounded-xl border border-[#d9e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#243b30] hover:bg-[#f3f8f5]">⌖ Locations</a>
            <a href="/dashboard#action-inbox" className="inline-flex items-center gap-2 rounded-xl bg-[#075b46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#064b3a]">↗ Get feedback</a>
            <a href="/dashboard/feedback" className="inline-flex items-center gap-2 rounded-xl border border-[#d9e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#243b30] hover:bg-[#f3f8f5]">☷ View activity</a>
          </div>
        </header>/header>

        <section aria-label="Workspace metrics" className="py-7"><div className="mb-4"><h2 className="text-xl font-semibold">Tracked by MERIT</h2><p className="mt-1 text-sm text-[#64746c]">From completed services to customer feedback</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-2xl border border-[#dfe4df] bg-white/75 p-5 transition-colors hover:bg-white">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#557565]">{metric.label}</p>
                <span className="text-[10px] font-semibold tracking-[0.16em] text-[#9aa69e]">{metric.mark}</span>
              </div>
              <p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums text-[#123c2d]">{metric.value.toLocaleString()}</p>
              <p className="mt-2 text-xs leading-5 text-[#718178]">{metric.note}</p>
            </article>
          ))}
        </div></section>

        <section id="action-inbox" className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
          <div className="rounded-3xl border border-[#dfe4df] bg-white/80 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Action inbox</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{pendingCount ? "Follow up on open requests" : "Your inbox is clear"}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#69756e]">
                  {pendingCount ? "Review pending feedback requests and keep customer follow-up moving." : "New service events and feedback requests will appear here when the workflow is connected and active."}
                </p>
              </div>
              <span className="rounded-full bg-[#e7eee9] px-3 py-1.5 text-xs font-semibold text-[#315b49]">{pendingCount} pending</span>
            </div>
            <div className="mt-6">
              <InboxActions
                workspaceId={workspaceId}
                initialFeedback={recentFeedback.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
              />
            </div>
          </div>

          <aside className="rounded-3xl border border-[#f0e2c9] bg-[#fffaf1] p-6 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[#75431a]">Service recovery required: {pendingCount} open</h2>
                <p className="mt-2 text-sm leading-6 text-[#6f675c]">Requests still awaiting action may need a customer follow-up.</p>
              </div>
              <span className="text-xl text-[#a56824]" aria-hidden="true">⚠</span>
            </div>
            <div className="mt-5 divide-y divide-[#f0e5d4]">
              {recentFeedback.filter((item) => item.status === "PENDING").slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5ead8] text-xs font-semibold text-[#7b4c1e]">{(item.customer.name || item.customer.email || "C").slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#29372f]">{item.customer.name || item.customer.email || "Customer"}</p>
                    <p className="mt-1 truncate text-xs text-[#756d62]">{item.branch.name} · {new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#f8e8cb] px-2.5 py-1 text-[11px] font-semibold text-[#80501c]">Follow up</span>
                </div>
              ))}
              {pendingCount === 0 ? <p className="py-4 text-sm text-[#6f675c]">No open requests need follow-up right now.</p> : null}
            </div>
            <a href="/dashboard/feedback" className="mt-5 inline-flex text-sm font-semibold text-[#075b46] underline underline-offset-4">View all feedback ↗</a>
          </aside>  </aside>
        </section>

        <section id="intelligence" className="mt-7">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Understand the signal</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Feedback intelligence</h2>
            <p className="mt-1 text-sm text-[#69756e]">Recent replies and emerging themes from this workspace.</p>
          </div>
          <Intelligence
            initialInsights={insights.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
            initialReplies={replies.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
              feedback: {
                ...item.feedback,
                customer: {
                  ...item.feedback.customer,
                  optedOutAt: item.feedback.customer.optedOutAt ? item.feedback.customer.optedOutAt.toISOString() : null,
                },
              },
            }))}
          />
        </section>

        <section id="workspace-settings" className="mt-10 border-t border-[#dfe4df] pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Workspace management</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your workspace, organised</h2>
          <p className="mt-1 text-sm text-[#69756e]">Manage locations, authorised team members, and supporting files.</p>
          <div id="branches" className="mt-5"><BranchManager workspaceId={workspaceId} initialBranches={branches} /></div>
          <div id="files" className="mt-5"><FileLibrary workspaceId={workspaceId} /></div>
          <div id="team" className="mt-5">
            <MemberManager
              workspaceId={workspaceId}
              initialMembers={members.map((member) => ({ id: member.id, role: member.role, user: member.user }))}
            />
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-2 border-t border-[#dfe4df] pt-5 text-xs text-[#7b887f] sm:flex-row sm:items-center sm:justify-between">
          <span>MERIT · Customer intelligence, quietly automated.</span>
          <span>Workspace data is shown within your authorised membership.</span>
        </footer>
      </div>
      </main>
    </div>
  );
}
