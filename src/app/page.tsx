import Link from "next/link";
import MeritMark from "@/components/MeritMark";

const features = [
  {
    number: "01",
    title: "Privacy first",
    description:
      "Customer data stays behind explicit workspace and permission boundaries. Access is designed around the people who need it.",
  },
  {
    number: "02",
    title: "Automated feedback",
    description:
      "Capture completed-service events and turn them into timely feedback requests, without adding another manual task to the day.",
  },
  {
    number: "03",
    title: "Actionable intelligence",
    description:
      "Surface recurring customer themes and operational signals without exposing raw customer data unnecessarily.",
  },
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
          <nav className="flex items-center gap-3">
            <Link
              href="/auth"
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#315b49] transition hover:bg-[#e9eee7]"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-full bg-[#123c2d] px-5 py-2.5 text-sm font-semibold text-[#f7f4ec] transition hover:bg-[#1c513d]"
            >
              Get started
            </Link>
          </nav>
        </header>

        <section className="relative py-20 md:py-28">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-4 hidden h-80 w-80 rounded-full border border-[#dfe4df] md:block" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 hidden h-52 w-52 rounded-full border border-[#dfe4df] md:block" />
          <div className="relative max-w-3xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dfe4df] bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#426b58]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#47795f]" />
              Customer intelligence, with privacy built in
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight text-[#17211c] md:text-7xl">
              Customer feedback,
              <span className="block text-[#315b49]">quietly automated.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#69756e] md:text-xl md:leading-9">
              MERIT helps establishments and corporations follow up with customers,
              understand what they are saying, and turn feedback into better
              operations — with privacy built into the foundation.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/auth"
                className="inline-flex items-center gap-3 rounded-full bg-[#123c2d] px-6 py-3.5 text-sm font-semibold text-[#f7f4ec] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1c513d]"
              >
                Create your workspace <span aria-hidden="true">↗</span>
              </Link>
              <span className="text-sm text-[#69756e]">Built for trust. Designed to scale.</span>
            </div>
          </div>
        </section>

        <section aria-label="MERIT capabilities" className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.number}
              className="rounded-2xl border border-[#dfe4df] bg-white/55 p-7 transition hover:-translate-y-1 hover:bg-white/85"
            >
              <p className="text-xs font-semibold tracking-[0.18em] text-[#8b9a90]">{feature.number}</p>
              <h2 className="mt-7 text-xl font-semibold text-[#123c2d]">{feature.title}</h2>
              <p className="mt-3 leading-7 text-[#69756e]">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-20 overflow-hidden rounded-3xl bg-[#123c2d] px-7 py-10 text-[#f7f4ec] md:mt-24 md:px-12 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c0d2c5]">Built for trust</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
            Your customers are not the product. Their feedback is the signal.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-white/15 pt-6">
            <p className="max-w-xl leading-7 text-[#d4e0d7]">
              A clearer view of customer experience, with thoughtful boundaries around the data behind it.
            </p>
            <Link href="/auth" className="rounded-full bg-[#f7f4ec] px-5 py-3 text-sm font-semibold text-[#123c2d] transition hover:bg-white">
              Get started <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <footer className="flex flex-col gap-3 py-8 text-xs text-[#7b887f] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} MERIT</span>
          <span>Customer intelligence, quietly automated.</span>
          <Link href="/privacy" className="font-semibold text-[#315b49] hover:underline">
            Privacy Policy
          </Link>
        </footer>
      </section>
    </main>
  );
}
