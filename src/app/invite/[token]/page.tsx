"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function InviteTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: params.token }),
      });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Could not accept invitation."); return; }
      router.push("/dashboard");
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f3ea] px-6 text-[#173b2f]">
      <section className="w-full max-w-md rounded-3xl border border-[#dfe5dc] bg-white/90 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#557565]">MERIT</p>
        <h1 className="mt-3 text-3xl font-semibold">Join a workspace</h1>
        <p className="mt-2 text-sm text-[#557565]">Accept your invitation with the account whose email received it.</p>
        {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
        <button onClick={accept} disabled={busy} className="mt-6 w-full rounded-xl bg-[#173b2f] px-4 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "Joining…" : "Accept invitation"}
        </button>
      </section>
    </main>
  );
}
