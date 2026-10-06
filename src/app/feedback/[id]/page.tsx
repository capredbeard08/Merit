import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";
import FeedbackForm from "./form";

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!t || !verifyFeedbackToken(id, t)) notFound();

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: { workspace: true, branch: true, customer: true },
  });
  if (!feedback || feedback.customer.optedOutAt) notFound();

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-12 text-[#173b2f]">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#557565]">MERIT</p>
        <section className="mt-4 rounded-3xl border border-[#dfe5dc] bg-white/90 p-8 shadow-sm">
          <h1 className="text-3xl font-semibold">How was your experience?</h1>
          <p className="mt-3 text-[#557565]">{feedback.workspace.name} · {feedback.branch.name}</p>
          <p className="mt-2 text-sm text-[#718178]">We want the honest version — what went well and what could be better.</p>
          <FeedbackForm feedbackId={id} token={t} />
        </section>
      </div>
    </main>
  );
}
