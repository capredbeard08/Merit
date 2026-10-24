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
import SignOutButton from "@/components/SignOutButton";

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
  const [feedbackCount, sentCount, pendingCount, repliedCount, recentFeedback, branches, members, insights, replies] = await Promise.all([
    prisma.feedback.count({ where: { workspaceId } }),
    prisma.feedback.count({ where: { workspaceId, sentAt: { not: null } } }),
    prisma.feedback.count({ where: { workspaceId, status: "PENDING" } }),
    prisma.feedback.count({ where: { workspaceId, status: "REPLIED" } }),
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

  const metrics = [
    { label: "Feedback requests", value: feedbackCount, note: "Created in this workspace", mark: "01" },
    { label: "Follow-ups sent", value: sentCount, note: "Successfully recorded as sent", mark: "02" },
    { label: "Replies received", value: repliedCount, note: "Feedback with a customer reply", mark: "03" },
    { label: "Awaiting response", value: pendingCount, note: "Requests still pending", mark: "04" },
  ];

  return (
    <main className="min-h-screen bg-[#f7f4ec] px-4 py-6 text-[#17211c] sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-col gap-5 border-b border-[#dfe4df] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <a href="/dashboard" aria-label="MERIT dashboard home" className="merit-brand">
              <MeritMark size={40} />
              <span className="merit-brand-name">MERIT</span>
            </a>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#718178]">Workspace overview</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{membership.workspace.name}</h1>
            <p className="mt-2 text-sm text-[#69756e]">A clear view of customer experience and the work that follows.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe4df] bg-white/65 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e7eee9] text-sm font-semibold text-[#315b49]">
              {(session.user.name || session.user.email || "M").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[#718178]">Signed in as</p>
              <p className="max-w-[240px] truncate text-sm font-medium text-[#173b2f]">{session.user.name || session.user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </header>

        <section aria-label="Workspace metrics" className="grid gap-4 py-7 sm:grid-cols-2 xl:grid-cols-4">
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
        </section>

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

          <aside className="flex flex-col justify-between rounded-3xl bg-[#123c2d] p-6 text-[#f7f4ec] sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c0d2c5]">MERIT principle</p>
              <h2 className="mt-4 text-2xl font-semibold leading-tight">Listen carefully. Act deliberately.</h2>
              <p className="mt-3 text-sm leading-6 text-[#d4e0d7]">Feedback only matters when it helps your team understand what happened and decide what to improve.</p>
            </div>
            <div className="mt-8 border-t border-white/15 pt-4">
              <p className="text-xs text-[#c0d2c5]">Workspace activity</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span>Branches</span><span className="font-semibold tabular-nums">{branches.length}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span>Team members</span><span className="font-semibold tabular-nums">{members.length}</span>
              </div>
            </div>
          </aside>
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
  );
}
