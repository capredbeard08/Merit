import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/feedback-token";
import OptOutForm from "./optout-form";

export default async function OptOutPage({
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
    select: {
      id: true,
      workspace: { select: { name: true } },
      customer: { select: { optedOutAt: true } },
    },
  });
  if (!feedback) notFound();

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-16 text-[#173b2f]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[#dfe5dc] bg-white/80 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#557565]">MERIT</p>
        {feedback.customer.optedOutAt ? (
          <>
            <h1 className="mt-4 text-3xl font-semibold">You’re already opted out.</h1>
            <p className="mt-3 text-[#557565]">You will no longer receive feedback requests from {feedback.workspace.name}.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-semibold">Stop feedback requests?</h1>
            <p className="mt-3 text-[#557565]">Confirm below if you no longer want to receive feedback requests from {feedback.workspace.name}.</p>
            <OptOutForm feedbackId={id} token={t} />
          </>
        )}
      </div>
    </main>
  );
}
