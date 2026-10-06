"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Insight = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  evidence: unknown;
  createdAt: string;
};

type Reply = {
  id: string;
  rating: string | null;
  message: string | null;
  createdAt: string;
  feedback: {
    id: string;
    customer: { name: string | null; email: string | null; optedOutAt: string | null };
    branch: { name: string };
  };
};

const ratingValue: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export default function Intelligence({
  initialInsights,
  initialReplies,
}: {
  initialInsights: Insight[];
  initialReplies: Reply[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      await fetch("/api/insights/generate", { method: "POST" });
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Insights</p>
            <h2 className="mt-2 text-2xl font-semibold">What customers are telling you.</h2>
            <p className="mt-2 text-[#557565]">MERIT groups recent feedback into practical signals without sending raw customer comments to an external AI model.</p>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded-xl bg-[#173b2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate insights"}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {initialInsights.length ? initialInsights.slice(0, 3).map((insight) => (
            <article key={insight.id} className="rounded-2xl border border-[#dfe5dc] bg-[#fbfaf6] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718178]">{insight.kind.replace("_", " ")}</p>
              <h3 className="mt-2 font-semibold">{insight.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#557565]">{insight.summary}</p>
              <p className="mt-3 text-xs text-[#718178]">{new Date(insight.createdAt).toLocaleString()}</p>
            </article>
          )) : (
            <p className="text-sm text-[#718178] md:col-span-3">No insight has been generated yet. Capture a few replies, then generate the first signal.</p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Customer timeline</p>
        <h2 className="mt-2 text-2xl font-semibold">Recent replies</h2>
        <div className="mt-5 space-y-3">
          {initialReplies.length ? initialReplies.map((reply) => (
            <article key={reply.id} className="rounded-2xl border border-[#dfe5dc] bg-[#fbfaf6] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{reply.feedback.customer.name || "Customer"}</span>
                  <span className="ml-2 text-sm text-[#718178]">· {reply.feedback.branch.name}</span>
                </div>
                <span className="text-sm font-semibold">
                  {reply.rating ? ratingValue[reply.rating] + "/5" : "No rating"}
                </span>
              </div>
              {reply.message ? <p className="mt-3 text-sm leading-6 text-[#557565]">{reply.message}</p> : null}
              <p className="mt-3 text-xs text-[#718178]">{new Date(reply.createdAt).toLocaleString()}</p>
            </article>
          )) : (
            <p className="text-sm text-[#718178]">No customer replies yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
