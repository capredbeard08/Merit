import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import InboxActions from "./actions";
import BranchManager from "./branches";
import MemberManager from "./members";
import Intelligence from "./intelligence";
import MeritMark from "@/components/MeritMark";
import FileLibrary from "./files";
import SecurityCenter from "./security-center";
import { can, type Role } from "@/lib/domain";
import { resolveWorkspaceMembership } from "@/lib/workspace-access";

function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return (
    <article className="merit-metric-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="merit-metric-icon" aria-hidden="true">{icon}</span>
          <p className="text-sm font-semibold text-[#40594b]">{label}</p>
        </div>
        <span className="merit-metric-trend" aria-hidden="true">↗</span>
      </div>
      <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-[#123c2d]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#718178]">{note}</p>
    </article>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth");

  const { workspaceId: requestedWorkspaceId } = await searchParams;
  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/auth");

  // A requested workspace is usable only when the signed-in user has a membership.
  const membership = resolveWorkspaceMembership(memberships, requestedWorkspaceId);
  if (!membership) redirect("/dashboard");

  const workspaceId = membership.workspaceId;
  const role = membership.role.toLowerCase() as Role;
  const canManageBranches = can(role, "branches:manage");
  const [serviceCount, feedbackCount, sentCount, clickedCount, pendingCount, repliedCount, recentFeedback, branches, archivedBranches, members, insights, replies] = await Promise.all([
    prisma.serviceEvent.count({ where: { workspaceId } }),
    prisma.feedback.count({ where: { workspaceId } }),
    prisma.feedback.count({ where: { workspaceId, sentAt: { not: null } } }),
    prisma.feedback.count({ where: { workspaceId, clickedAt: { not: null } } }),
    prisma.feedback.count({ where: { workspaceId, status: "PENDING" } }),
    prisma.feedback.count({ where: { workspaceId, status: "REPLIED" } }),
    prisma.feedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, status: true, createdAt: true, customer: { select: { name: true, email: true } }, branch: { select: { name: true } } },
    }),
    prisma.branch.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, externalId: true } }),
    canManageBranches ? prisma.branch.findMany({ where: { workspaceId, archivedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, externalId: true } }) : Promise.resolve([]),
    prisma.member.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true, name: true } } } }),
    prisma.insight.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.feedbackReply.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, rating: true, message: true, createdAt: true,
        feedback: { select: { id: true, customer: { select: { name: true, email: true, optedOutAt: true } }, branch: { select: { name: true } } } },
      },
    }),
  ]);

  const sendRate = feedbackCount ? Math.round((sentCount / feedbackCount) * 100) : 0;
  const clickRate = sentCount ? Math.round((clickedCount / sentCount) * 100) : 0;
  const greetingName = (session.user.name || membership.workspace.name || "there").split(" ")[0];

  return (
    <main className="min-h-screen bg-[#f8f5eb] text-[#17211c]">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="merit-sidebar hidden w-[252px] shrink-0 px-5 py-7 lg:flex lg:flex-col">
          <a href="#overview" aria-label="MERIT dashboard home" className="mb-8 flex items-center gap-3 text-[#f8f5eb]">
            <MeritMark size={42} />
            <span className="text-xl font-bold tracking-[0.13em]">MERIT</span>
          </a>
          <p className="mb-7 px-2 text-xs leading-5 text-[#c4d4c9]">Customer feedback, quietly automated.</p>
          <nav aria-label="Dashboard navigation" className="space-y-1">
            {[
              ["overview", "Overview", "⌂"],
              ["action-inbox", "Activity", "⌁"],
              ["intelligence", "Feedback", "◌"],
              ["branches", "Locations", "⌖"],
              ["files", "Files", "▤"],
              ["team", "Team", "♧"],
            ].map(([id, label, icon], index) => (
              <a key={id} href={`#${id}`} className={`merit-nav-link ${index === 0 ? "merit-nav-active" : ""}`}>
                <span aria-hidden="true" className="w-5 text-center text-lg">{icon}</span>{label}
              </a>
            ))}
            {can(role, "security:read") ? <a href="#security-center" className="merit-nav-link"><span className="w-5 text-center">◇</span>Security Warden</a> : null}
          </nav>
          <div className="mt-auto border-t border-white/15 pt-5">
            {memberships.length > 1 ? (
              <form action="/dashboard" method="get" className="mb-5 space-y-2">
                <label htmlFor="workspace-switcher" className="block text-xs font-semibold text-[#dce8df]">Your workspaces</label>
                <select id="workspace-switcher" name="workspaceId" defaultValue={membership.workspaceId} className="w-full rounded-lg border border-white/20 bg-[#173d2e] px-2 py-2 text-sm text-white">
                  {memberships.map((item) => <option key={item.workspaceId} value={item.workspaceId}>{item.workspace.name}</option>)}
                </select>
                <button type="submit" className="w-full rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-[#e3ece5] hover:bg-white/10">Switch workspace</button>
              </form>
            ) : null}
            <p className="text-xs font-semibold text-[#dce8df]">{membership.workspace.name}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4f8067] bg-[#174a36] font-semibold text-white">{(session.user.name || session.user.email || "M").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{session.user.name || "Merit"}</p><p className="text-xs text-[#b9cabe]">Workspace member</p></div>
            </div>
            <form method="post" action="/api/auth/sign-out" className="mt-5"><button type="submit" className="w-full rounded-xl border border-white/25 px-4 py-2.5 text-center text-sm text-[#e3ece5] transition hover:bg-white/10">Sign out</button></form>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-9">
          <div className="mx-auto max-w-[1260px]">
            <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">
              {[["overview", "Overview"], ["action-inbox", "Activity"], ["intelligence", "Feedback"], ["branches", "Locations"], ["files", "Files"], ["team", "Team"]].map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-[#dce2d8] bg-white/80 px-4 py-2 text-xs font-semibold text-[#315b49]">{label}</a>)}
            </div>

            <header id="overview" className="flex scroll-mt-5 flex-col gap-5 border-b border-[#dce2d8] pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#718178]">Workspace · {membership.workspace.name}</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#123c2d] sm:text-[2.65rem]">Good morning, {greetingName}</h1>
                <p className="mt-2 text-sm text-[#69756e]">Here’s what’s happening with your customer feedback.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="#branches" className="merit-action-secondary">⌖ Locations</a>
                <a href="#action-inbox" className="merit-action-primary">↗ Get feedback</a>
                <a href="#action-inbox" className="merit-action-secondary">☷ View activity</a>
              </div>
            </header>

            <section className="pt-6" aria-labelledby="funnel-title">
              <div className="mb-4"><h2 id="funnel-title" className="text-lg font-semibold text-[#183d2f]">Request funnel</h2><p className="text-sm text-[#718178]">From recorded service events to private feedback · All locations</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard label="Services completed" value={serviceCount.toLocaleString()} note="Completed service events received" icon="✓" />
                <MetricCard label="Requests sent" value={sentCount.toLocaleString()} note={`${feedbackCount.toLocaleString()} feedback requests recorded`} icon="✉" />
                <MetricCard label="Send rate" value={`${sendRate}%`} note="Sent requests / recorded requests" icon="↗" />
                <MetricCard label="Click rate" value={`${clickRate}%`} note={`${clickedCount.toLocaleString()} review-link clicks recorded`} icon="⌁" />
                <MetricCard label="Feedback received" value={repliedCount.toLocaleString()} note="Requests with a customer reply" icon="◌" />
              </div>
            </section>

            <section className="merit-panel mt-6 p-5 sm:p-7" aria-labelledby="clicks-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 id="clicks-title" className="text-lg font-semibold text-[#183d2f]">Review-link clicks</h2><p className="mt-1 text-sm text-[#718178]">Recorded clicks · All locations</p></div>
                <span className="rounded-full bg-[#e7eee0] px-3 py-1.5 text-xs font-semibold text-[#315b49]">{clickedCount.toLocaleString()} tracked</span>
              </div>
              {clickedCount > 0 ? (
                <div className="mt-5 rounded-xl bg-[#fbfaf5] px-4 py-5">
                  <p className="text-sm text-[#718178]">Total recorded clicks: <strong className="text-[#123c2d]">{clickedCount.toLocaleString()}</strong></p>
                  <p className="mt-2 text-xs text-[#8a968d]">The trend view will appear as dated click history becomes available.</p>
                </div>
              ) : <div className="mt-5 flex min-h-[150px] flex-col justify-end rounded-xl bg-[#fbfaf5] px-4 py-5"><p className="mb-5 text-sm text-[#718178]">No review-link clicks recorded in this period yet.</p><div className="merit-chart-baseline"><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="mt-3 flex justify-between text-[10px] text-[#87938a]"><span>Recent activity</span><span>Waiting for first click</span></div></div>}
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
              <div className="merit-info-panel p-6 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">A clearer signal</p>
                <h2 className="mt-3 text-xl font-semibold text-[#123c2d]">What these numbers mean</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52665a]">MERIT counts recorded service events, feedback requests, review-link clicks, and replies from your workspace data. These are operational metrics, not independently verified public reviews.</p>
                <a href="#intelligence" className="mt-5 inline-flex font-semibold text-[#176044] underline decoration-[#8ab69e] underline-offset-4">Explore feedback →</a>
              </div>
              <div id="action-inbox" className="merit-panel scroll-mt-5 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#718178]">Action inbox</p>
                <h2 className="mt-2 text-xl font-semibold text-[#183d2f]">{pendingCount ? "Requests need attention" : "Your inbox is clear"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#718178]">{pendingCount ? "Review pending requests and keep customer follow-up moving." : "New service events and feedback requests will appear here when the workflow is connected and active."}</p>
                <span className="mt-4 inline-flex rounded-full bg-[#e7eee0] px-3 py-1.5 text-xs font-semibold text-[#315b49]">{pendingCount.toLocaleString()} pending</span>
                <div className="mt-5"><InboxActions workspaceId={workspaceId} initialFeedback={recentFeedback.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} /></div>
              </div>
            </section>

            <section id="intelligence" className="mt-9 scroll-mt-5">
              <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#557565]">Understand the signal</p><h2 className="mt-1 text-2xl font-semibold text-[#123c2d]">Feedback intelligence</h2><p className="mt-1 text-sm text-[#718178]">Recent replies and emerging themes from this workspace.</p></div>
              <Intelligence workspaceId={workspaceId} initialInsights={insights.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} initialReplies={replies.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), feedback: { ...item.feedback, customer: { ...item.feedback.customer, optedOutAt: item.feedback.customer.optedOutAt ? item.feedback.customer.optedOutAt.toISOString() : null } } }))} />
            </section>

            <section id="workspace-settings" className="mt-10 border-t border-[#dce2d8] pt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#557565]">Workspace management</p><h2 className="mt-1 text-2xl font-semibold text-[#123c2d]">Your workspace, organised</h2><p className="mt-1 text-sm text-[#718178]">Manage locations, authorised team members, and supporting files.</p>
              <div id="branches" className="mt-5 scroll-mt-5"><BranchManager workspaceId={workspaceId} initialBranches={branches} initialArchivedBranches={archivedBranches} canManage={canManageBranches} /></div>
              <div id="files" className="mt-5 scroll-mt-5"><FileLibrary workspaceId={workspaceId} canManage={can(role, "files:manage")} canRecover={can(role, "files:recover")} canErase={can(role, "files:erase")} /></div>
              <div id="team" className="mt-5 scroll-mt-5"><MemberManager workspaceId={workspaceId} initialMembers={members.map((member) => ({ id: member.id, role: member.role, user: member.user }))} /></div>
            </section>
            {can(role, "security:read") ? <div id="security-center" className="mt-8 scroll-mt-5"><SecurityCenter workspaceId={workspaceId} /></div> : null}
            <footer className="mt-10 flex flex-col gap-2 border-t border-[#dce2d8] pt-5 text-xs text-[#7b887f] sm:flex-row sm:justify-between"><span>MERIT · Customer intelligence, quietly automated.</span><span>Workspace data is shown within your authorised membership.</span></footer>
          </div>
        </div>
      </div>
    </main>
  );
}
