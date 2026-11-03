import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isGuestPublicId } from "@/lib/guest-feedback";
import GuestFeedbackForm from "./guest-feedback-form";

export const metadata = {
  title: "Share your experience",
  robots: { index: false, follow: false },
};

export default async function GuestFeedbackPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!isGuestPublicId(publicId)) notFound();

  const qrCode = await prisma.guestQrCode.findFirst({
    where: {
      publicId,
      status: "ACTIVE",
      branch: { archivedAt: null },
    },
    select: {
      branch: {
        select: {
          name: true,
          workspace: { select: { name: true } },
          workspaceId: true,
        },
      },
      workspaceId: true,
    },
  });

  if (!qrCode || qrCode.branch.workspaceId !== qrCode.workspaceId) notFound();

  return (
    <main className="min-h-screen bg-[#f8f5eb] px-4 py-8 text-[#17211c] sm:px-6 sm:py-14">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-xl flex-col">
        <header className="flex items-center justify-between">
          <span className="text-sm font-extrabold tracking-[0.24em] text-[#123c2d]">MERIT</span>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#718178]">Guest feedback</span>
        </header>

        <section className="my-auto mt-10 rounded-[1.7rem] border border-[#dce2d8] bg-white/90 p-6 shadow-[0_16px_50px_rgba(24,50,34,.06)] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#668071]">
            {qrCode.branch.workspace.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#123c2d] sm:text-4xl">
            How was your experience?
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#69756e]">
            Your honest feedback helps {qrCode.branch.name} understand what is working and where it can improve.
          </p>
          <GuestFeedbackForm publicId={publicId} />
          <p className="mt-7 text-center text-xs leading-5 text-[#879189]">
            Your feedback is shared privately with this establishment. No account is needed.
          </p>
        </section>

        <footer className="pt-7 text-center text-xs tracking-wide text-[#879189]">
          Customer feedback, quietly automated.
        </footer>
      </div>
    </main>
  );
}
