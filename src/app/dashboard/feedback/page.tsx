import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import MeritMark from "@/components/MeritMark";
import FeedbackInbox from "../FeedbackInbox";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/auth");

  const workspaceId = membership.workspaceId;
  const branches = await prisma.branch.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const params = await searchParams;
  const selectedBranch = branches.find((branch) => branch.id === params.location) ?? null;
  const branchFilter = selectedBranch ? { branchId: selectedBranch.id } : {};
  const [records, pending, reviewing, resolved, closed] = await Promise.all([
    prisma.feedback.findMany({
      where: { workspaceId, ...branchFilter },
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
    prisma.feedback.count({ where: { workspaceId, ...branchFilter, status: "PENDING" } }),
    prisma.feedback.count({ where: { workspaceId, ...branchFilter, status: { in: ["CONTACTED", "CLICKED", "REPLIED"] } } }),
    prisma.feedback.count({ where: { workspaceId, ...branchFilter, status: "RESOLVED" } }),
    prisma.feedback.count({ where: { workspaceId, ...branchFilter, status: "OPTED_OUT" } }),
  ]);

  return (
    <main className="min-h-screen bg-[#f7f4ec] px-4 py-6 text-[#17211c] sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-5 border-b border-[#dfe4df] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" aria-label="MERIT dashboard home" className="flex items-center gap-2 text-[#123c2d]">
              <MeritMark size={38} /><span className="text-2xl font-extrabold tracking-[0.08em]">MERIT</span>
            </Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#718178]">Workspace · {membership.workspace.name}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Feedback inbox</h1>
            <p className="mt-2 text-sm text-[#69756e]">Private customer feedback and the work your team takes forward.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="rounded-xl border border-[#d9e2dc] bg-white/80 px-4 py-3 text-sm font-semibold text-[#243b30] hover:bg-white">← Overview</Link>
            {branches.length > 1 ? (
              <form action="/dashboard/feedback" method="get" className="flex items-center gap-2 rounded-xl border border-[#d9e2dc] bg-white/80 px-3 py-2">
                <label htmlFor="feedback-location" className="text-sm text-[#53645d]">Location</label>
                <select id="feedback-location" name="location" defaultValue={selectedBranch?.id ?? "all"} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="max-w-44 bg-transparent px-1 py-1 text-sm text-[#173b2f]">
                  <option value="all">All locations</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </form>
            ) : null}
          </div>
        </header>
        <section className="mt-6">
          <p className="text-sm text-[#64746c]">{selectedBranch ? selectedBranch.name : "All active locations"} · {records.length} most recent records shown</p>
          <FeedbackInbox
            workspaceId={workspaceId}
            initialItems={records.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
              sentAt: item.sentAt?.toISOString() || null,
              clickedAt: item.clickedAt?.toISOString() || null,
              repliedAt: item.repliedAt?.toISOString() || null,
              replies: item.replies.map((reply) => ({ ...reply, createdAt: reply.createdAt.toISOString() })),
            }))}
            counts={{ new: pending, reviewing, resolved, closed }}
          />
        </section>
        <footer className="mt-10 border-t border-[#dfe4df] pt-5 text-xs text-[#7b887f]">
          Workspace records are shown only within the signed-in member's authorised workspace.
        </footer>
      </div>
    </main>
  );
}
