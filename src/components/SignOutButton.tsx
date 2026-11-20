"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Sign out failed. Please try again.");
        setPending(false);
        return;
      }
      router.replace("/auth");
      router.refresh();
    } catch {
      setError("Sign out failed. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className="rounded-xl border border-[#cbd8ce] px-4 py-2 text-sm font-semibold text-[#315b49] transition-colors hover:bg-[#e7eee9] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? <p role="alert" className="max-w-[220px] text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
