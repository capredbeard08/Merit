"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new link.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError("This reset link may be invalid or expired. Request a new password-reset link.");
        return;
      }
      setComplete(true);
      window.setTimeout(() => router.replace("/auth?password-reset=1"), 1200);
    } catch {
      setError("The password could not be reset. Request a new link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f0e7] px-5 py-12 text-[#173b2f]">
      <section className="mx-auto max-w-md rounded-2xl border border-[#d9dfd4] bg-[#fbfaf6] p-7 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#587466]">MERIT ACCOUNT</p>
        <h1 className="mt-3 text-2xl font-semibold">Choose a new password</h1>
        {complete ? (
          <p role="status" className="mt-4 text-sm leading-7 text-[#586b61]">Your password has been reset and existing sessions have been revoked. Redirecting you to sign in…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label htmlFor="password" className="block text-sm font-medium">New password</label>
            <input id="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 outline-none focus:border-[#173b2f]" />
            <label htmlFor="confirm-password" className="block text-sm font-medium">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 outline-none focus:border-[#173b2f]" />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button disabled={busy || !token} className="w-full rounded-lg bg-[#173b2f] px-4 py-3 font-medium text-white disabled:opacity-50">{busy ? "Updating…" : "Reset password"}</button>
          </form>
        )}
        <Link href="/auth" className="mt-6 inline-block text-sm font-semibold text-[#315b49] underline underline-offset-2">Back to sign in</Link>
      </section>
    </main>
  );
}
