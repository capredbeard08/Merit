"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: window.location.origin + "/reset-password",
      });
      if (result.error) {
        setError("We could not process that request right now. Check the address and try again later.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We could not process that request right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f0e7] px-5 py-12 text-[#173b2f]">
      <section className="mx-auto max-w-md rounded-2xl border border-[#d9dfd4] bg-[#fbfaf6] p-7 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#587466]">MERIT ACCOUNT</p>
        <h1 className="mt-3 text-2xl font-semibold">Reset your password</h1>
        {submitted ? (
          <p role="status" className="mt-4 text-sm leading-7 text-[#586b61]">If an account matches that address, a password-reset link will be sent. Check your inbox and spam folder. The link is valid for one hour.</p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-[#586b61]">Enter the email address associated with your MERIT account. For privacy, we show the same confirmation whether or not an account matches.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label htmlFor="email" className="block text-sm font-medium">Email address</label>
              <input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 outline-none focus:border-[#173b2f]" />
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button disabled={busy} className="w-full rounded-lg bg-[#173b2f] px-4 py-3 font-medium text-white disabled:opacity-50">{busy ? "Requesting…" : "Send reset link"}</button>
            </form>
          </>
        )}
        <Link href="/auth" className="mt-6 inline-block text-sm font-semibold text-[#315b49] underline underline-offset-2">Back to sign in</Link>
      </section>
    </main>
  );
}
