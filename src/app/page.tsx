import Link from "next/link";
import MeritMark from "@/components/MeritMark";

const outcomes = [
  {
    number: "01",
    title: "Follow up after every service",
    description: "Turn completed-service events into timely feedback requests without adding another manual task to the day.",
  },
  {
    number: "02",
    title: "Find recurring issues",
    description: "Group customer comments by theme, branch, and service so teams can see what keeps coming up.",
  },
  {
    number: "03",
    title: "Turn insight into action",
    description: "Give managers a clear next step: review, assign, resolve, and monitor whether the issue improves.",
  },
];

const workflow = [
  ["01", "Service completed", "A completed visit or job enters your workspace."],
  ["02", "Feedback requested", "MERIT sends a timely request through your configured workflow."],
  ["03", "Operations improve", "Recurring issues become visible and ready for follow-up."],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden px-6 py-7 md:px-12 md:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="MERIT home" className="merit-brand">
            <MeritMark size={42} />
            <span className="merit-brand-name">MERIT</span>
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-3">
            <Link href="/auth" className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#315b49] transition hover:bg-[#e9eee7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2d]">
              Sign in
            </Link>
            <Link href="/auth" className="rounded-full bg-[#123c2d] px-5 py-2.5 text-sm font-semibold text-[#f7f4ec] transition hover:bg-[#1c513d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2d]">
              Create your workspace
            </Link>
          </nav>
        </header>

        <section className="relative grid gap-12 py-20 md:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] md:items-center md:py-28">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-4 hidden h-80 w-80 rounded-full border border-[#dfe4df] md:block" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 hidden h-52 w-52 rounded-full border border-[#dfe4df] md:block" />
          <div className="relative max-w-3xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dfe4df] bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#426b58]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#47795f]" />
              Customer feedback operations
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight text-[#17211c] md:text-7xl">
              Better feedback,
              <span className="block text-[#315b49]">better operations.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#69756e] md:text-xl md:leading-9">
              MERIT helps service businesses follow up with customers consistently, identify recurring issues, and turn what people say into the next operational improvement.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/auth" className="inline-flex items-center gap-3 rounded-full bg-[#123c2d] px-6 py-3.5 text-sm font-semibold text-[#f7f4ec] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1c513d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2d]">
                Create your workspace <span aria-hidden="true">↗</span>
              </Link>
              <span className="text-sm text-[#69756e]">Start with the workflow you already have.</span>
            </div>
          </div>

          <div className="relative rounded-3xl border border-[#dfe4df] bg-white/75 p-5 shadow-[0_18px_50px_rgba(18,60,45,0.08)]" aria-label="Example MERIT operations summary">
            <div className="flex items-center justify-between border-b border-[#e6ebe5] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">Workspace signal</p>
                <p className="mt-1 text-lg font-semibold text-[#123c2d]">This week at a glance</p>
              </div>
              <span className="rounded-full bg-[#e7eee9] px-3 py-1 text-xs font-semibold text-[#315b49]">Live view</span>
            </div>
            <div className="grid grid-cols-3 gap-3 py-5">
              {[["42", "responses"], ["3", "recurring themes"], ["1", "needs attention"]].map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-[#f7f4ec] p-3">
                  <p className="text-2xl font-semibold text-[#123c2d]">{value}</p>
                  <p className="mt-1 text-xs leading-4 text-[#69756e]">{label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#dfe4df] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#173b2f]">Appointment delays</p>
                <span className="text-xs font-semibold text-[#b05d3b]">Needs review</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#69756e]">18 mentions this month · Victoria Island branch</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e7eee9]"><div className="h-full w-[72%] rounded-full bg-[#47795f]" /></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#718178]">Example view for illustration. Your workspace will reflect your own customer feedback.</p>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="border-y border-[#dfe4df] py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">How it works</p>
          <h2 id="how-it-works" className="mt-3 max-w-2xl text-3xl font-semibold leading-tight text-[#123c2d] md:text-5xl">Close the loop between a completed service and a better one.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {workflow.map(([number, title, description]) => (
              <article key={number} className="rounded-2xl border border-[#dfe4df] bg-white/55 p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-[#8b9a90]">{number}</p>
                <h3 className="mt-5 text-lg font-semibold text-[#123c2d]">{title}</h3>
                <p className="mt-2 leading-7 text-[#69756e]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="outcomes" className="py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Built for service businesses</p>
          <h2 id="outcomes" className="mt-3 max-w-2xl text-3xl font-semibold leading-tight text-[#123c2d] md:text-5xl">The signal is useful when someone can act on it.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {outcomes.map((outcome) => (
              <article key={outcome.number} className="rounded-2xl border border-[#dfe4df] bg-white/55 p-7 transition hover:-translate-y-1 hover:bg-white/85">
                <p className="text-xs font-semibold tracking-[0.18em] text-[#8b9a90]">{outcome.number}</p>
                <h3 className="mt-7 text-xl font-semibold text-[#123c2d]">{outcome.title}</h3>
                <p className="mt-3 leading-7 text-[#69756e]">{outcome.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="privacy" className="overflow-hidden rounded-3xl bg-[#123c2d] px-7 py-10 text-[#f7f4ec] md:px-12 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c0d2c5]">Privacy by design</p>
          <h2 id="privacy" className="mt-4 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">Your customers are not the product. Their feedback is the signal.</h2>
          <div className="mt-8 grid gap-4 border-t border-white/15 pt-6 md:grid-cols-3">
            {[["Workspace boundaries", "Keep customer data inside the workspace and permissions that need it."], ["Least-privilege access", "Give each team member the role they need, without making every record visible to everyone."], ["Action history", "Keep an audit trail of important workspace actions as the product evolves."]].map(([title, description]) => (
              <div key={title}>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#d4e0d7]">{description}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-white/15 pt-6">
            <p className="max-w-xl leading-7 text-[#d4e0d7]">The product is designed to minimise unnecessary exposure of raw customer data while helping teams decide what to improve.</p>
            <Link href="/auth" className="rounded-full bg-[#f7f4ec] px-5 py-3 text-sm font-semibold text-[#123c2d] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Create your workspace <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <footer className="flex flex-col gap-4 py-8 text-xs text-[#7b887f] sm:flex-row sm:items-center sm:justify-between">
          <div><span>© {new Date().getFullYear()} MERIT</span><span className="mx-2">·</span><span>Customer feedback operations.</span></div>
          <div className="flex gap-5"><Link href="/privacy" className="font-semibold text-[#315b49] hover:underline">Privacy Policy</Link><a href="mailto:meritsupportdesk@gmail.com" className="font-semibold text-[#315b49] hover:underline">Contact</a></div>
        </footer>
      </section>
    </main>
  );
}
