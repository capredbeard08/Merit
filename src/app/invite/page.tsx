import { Suspense } from "react";
import InviteClient from "./invite-client";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f7f3ea] px-6 text-[#173b2f]">
          <p className="text-sm text-[#557565]">Loading invitation…</p>
        </main>
      }
    >
      <InviteClient />
    </Suspense>
  );
}
