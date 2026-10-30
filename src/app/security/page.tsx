import Link from "next/link";
import MeritMark from "@/components/MeritMark";

const safeguards = [
  ["Workspace boundaries", "Workspace membership is checked before dashboard and management data is loaded, and core records are scoped to their workspace."],
  ["Role-aware access", "Members carry explicit roles so access can be shaped around the work people need to do."],
  ["Action history", "Important workspace actions can be recorded in an audit log with actor, target, timestamp, and request context."],
  ["Protected feedback links", "Public feedback requests use signed tokens, and a feedback record can only be replied to once."],
  ["Webhook controls", "Service-completed events use workspace endpoint secrets, replay-window checks, payload limits, and duplicate protection."],
  ["Privacy-aware insights", "The product is designed to surface themes without requiring every workflow to expose raw customer comments."],
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ec] px-6 py-7 text-[#17211c] md:px-12 md:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between border-b border-[#dfe4df] pb-6">
          <Link href="/" aria-label="MERIT home" className="merit-brand"><MeritMark size={42} /><span className="merit-brand-name">MERIT</span></Link>
          <Link href="/" className="rounded-full px-4 py-2 text-sm font-semibold text-[#315b49] hover:bg-[#e9eee7]">Back to home</Link>
        </header>

        <section className="py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Trust and privacy</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-[#123c2d]">Security at MERIT</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#69756e]">MERIT is built for businesses that need customer feedback to become useful operational knowledge without making customer data unnecessarily exposed.</p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#718178]">This page describes safeguards present in the current product design. It is not a certification, independent audit, or promise that security risk can be eliminated.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Current safeguards">
          {safeguards.map(([title, description]) => <article key={title} className="rounded-2xl border border-[#dfe4df] bg-white/70 p-6"><h2 className="text-lg font-semibold text-[#123c2d]">{title}</h2><p className="mt-3 leading-7 text-[#69756e]">{description}</p></article>)}
        </section>

        <section className="mt-12 rounded-3xl bg-[#123c2d] p-7 text-[#f7f4ec] md:p-10">
          <h2 className="text-2xl font-semibold">Questions about your workspace?</h2>
          <p className="mt-3 max-w-2xl leading-7 text-[#d4e0d7]">For privacy or security questions, contact meritsupportdesk@gmail.com and include “Privacy request” or “Security question” in the subject.</p>
        </section>

        <footer className="flex flex-wrap gap-5 border-t border-[#dfe4df] py-8 text-xs text-[#7b887f]"><Link href="/privacy" className="font-semibold text-[#315b49] hover:underline">Privacy Policy</Link><Link href="/" className="font-semibold text-[#315b49] hover:underline">MERIT home</Link></footer>
      </div>
    </main>
  );
}
