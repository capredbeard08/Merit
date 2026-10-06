import { redirect } from "next/navigation";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: new Headers(),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    redirect("/auth");
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-10 text-[#173b2f]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-3 border-b border-[#dfe5dc] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#557565]">MERIT</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{membership.workspace.name}</h1>
            <p className="mt-2 text-[#557565]">
              Customer intelligence, quietly automated.
            </p>
          </div>
          <div className="text-sm text-[#557565]">
            Signed in as <span className="font-medium text-[#173b2f]">{session.user.email}</span>
          </div>
        </header>

        <section className="grid gap-5 py-8 md:grid-cols-3">
          {[
            ["Feedback", "0", "responses captured"],
            ["Follow-ups", "0", "messages sent"],
            ["Insights", "0", "actionable signals"],
          ].map(([label, value, detail]) => (
            <article key={label} className="rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
              <p className="text-sm font-medium text-[#557565]">{label}</p>
              <p className="mt-3 text-4xl font-semibold">{value}</p>
              <p className="mt-2 text-sm text-[#718178]">{detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Action inbox</p>
          <h2 className="mt-2 text-2xl font-semibold">Nothing needs your attention yet.</h2>
          <p className="mt-2 max-w-2xl text-[#557565]">
            Once service-completion events start flowing into MERIT, this is where customer
            signals, replies, and recommended actions will appear.
          </p>
        </section>
      </div>
    </main>
  );
}
