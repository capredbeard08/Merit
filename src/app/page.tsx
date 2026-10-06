const features = [
  ["Privacy first", "Customer data stays behind explicit workspace and permission boundaries."],
  ["Automated feedback", "Capture completed-service events and turn them into timely feedback requests."],
  ["Actionable intelligence", "Surface recurring customer themes without exposing raw customer data unnecessarily."],
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16 md:px-12">
      <section className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-[#123c2d]">MERIT</p>
          <h1 className="text-5xl font-semibold tracking-tight text-[#17211c] md:text-7xl">
            Customer feedback, quietly automated.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#69756e]">
            MERIT helps small businesses follow up with customers, understand what they are saying,
            and turn feedback into better operations — with privacy built into the foundation.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {features.map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-[#dfe4df] bg-white/60 p-7">
              <h2 className="text-xl font-semibold text-[#123c2d]">{title}</h2>
              <p className="mt-3 leading-7 text-[#69756e]">{description}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-[#123c2d] p-8 text-[#f7f4ec] md:p-12">
          <p className="text-sm uppercase tracking-[0.16em] opacity-70">Built for trust</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold">
            Your customers are not the product. Their feedback is the signal.
          </h2>
        </div>
      </section>
    </main>
  );
}
