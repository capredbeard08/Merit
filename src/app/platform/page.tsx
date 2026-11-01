import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { canAccessPlatform } from "@/lib/platform-access";

export const dynamic = "force-dynamic";

const panels = [
  {
    title: "Platform accounts",
    description: "Review platform operators and their separate platform roles.",
    status: "Not enabled yet",
  },
  {
    title: "Security and audit",
    description: "Review platform security events and privileged actions.",
    status: "Foundation in progress",
  },
  {
    title: "Deployment visibility",
    description: "View technical deployment status without accessing business records.",
    status: "Not enabled yet",
  },
  {
    title: "Business authorization",
    description: "Request narrowly scoped, time-limited access only after a business approves it.",
    status: "Required before support access",
  },
];

export default async function PlatformConsolePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth");

  const access = await prisma.platformAccess.findUnique({
    where: { userId: session.user.id },
    select: { role: true, revokedAt: true, createdAt: true },
  });

  if (!canAccessPlatform(access, "platform:security:read")) {
    return (
      <main className="min-h-screen px-6 py-16 md:px-12">
        <section className="mx-auto max-w-2xl rounded-3xl border border-[#dce2d8] bg-white/75 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">MERIT · Platform</p>
          <h1 className="mt-4 text-3xl font-semibold text-[#123c2d]">Platform access required</h1>
          <p className="mt-4 leading-7 text-[#69756e]">
            This account does not have an active platform operator role. A workspace Owner or business team membership does not grant access to the platform console.
          </p>
          <p className="mt-5 text-sm text-[#69756e]">Signed in as {session.user.email}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[#dce2d8] pb-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">MERIT · Platform operations</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#123c2d]">Platform console</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[#69756e]">
              Governance and technical visibility, kept separate from customer workspaces.
            </p>
          </div>
          <div className="rounded-2xl border border-[#dce2d8] bg-white/70 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718178]">Signed in</p>
            <p className="mt-1 font-semibold text-[#173b2f]">{session.user.email}</p>
            <p className="mt-2 inline-flex rounded-full bg-[#e7eee9] px-3 py-1 text-xs font-semibold text-[#315b49]">
              {access.role.replaceAll("_", " ")}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-[#dce2d8] bg-white/75 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#718178]">Platform identity</p>
            <h2 className="mt-3 text-xl font-semibold text-[#123c2d]">Active operator access</h2>
            <p className="mt-2 text-sm leading-6 text-[#69756e]">
              Your role is checked on the server. Revoked or missing platform access fails closed.
            </p>
          </article>
          <article className="rounded-2xl border border-[#dce2d8] bg-white/75 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#718178]">Business data boundary</p>
            <h2 className="mt-3 text-xl font-semibold text-[#123c2d]">No automatic workspace access</h2>
            <p className="mt-2 text-sm leading-6 text-[#69756e]">
              This console does not expose customer records, feedback, replies, uploaded files, or AI content.
            </p>
          </article>
        </section>

        <section className="mt-10">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Control areas</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#123c2d]">Platform operations</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {panels.map((panel) => (
              <article key={panel.title} className="rounded-2xl border border-[#dce2d8] bg-white/65 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-[#173b2f]">{panel.title}</h3>
                  <span className="rounded-full bg-[#f0eee5] px-3 py-1 text-xs font-medium text-[#68746b]">{panel.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#69756e]">{panel.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-10 border-t border-[#dce2d8] pt-5 text-xs leading-5 text-[#718178]">
          Platform role: {access.role}. Access created {access.createdAt.toLocaleDateString("en-GB")}. Workspace permissions remain separate.
        </footer>
      </div>
    </main>
  );
}
