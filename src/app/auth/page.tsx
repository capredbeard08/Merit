"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import MeritMark from "@/components/MeritMark";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    let stage = mode === "signup" ? "signup" : "signin";
    try {
      if (mode === "signup") {
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) {
          console.error("[MERIT auth] signup rejected", { code: result.error.code ?? null, status: result.error.status ?? null });
          throw new Error(result.error.message || result.error.code || "Unable to create account.");
        }

        stage = "workspace";
        const workspaceResponse = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workspace }),
        });
        if (!workspaceResponse.ok) {
          const body = await workspaceResponse.json().catch(() => null);
          throw new Error(body?.error || "Account created, but workspace setup failed.");
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message || "Unable to sign in.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.error("[MERIT auth] flow failed", { stage, error: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-16 text-[#173b2f]">
      <div className="mx-auto max-w-md">
        <div className="mb-10">
          <div className="merit-brand"><MeritMark size={48} /><span className="merit-brand-name">MERIT</span></div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">{isSignup ? "Create a workspace" : "Workspace access"}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {isSignup ? "Build your customer intelligence workspace." : "Welcome back."}
          </h1>
          <p className="mt-3 text-[#557565]">Your customer data stays yours. MERIT turns feedback into useful action.</p>
        </div>

        <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined} className="space-y-4 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
          {isSignup && (
            <>
              <label htmlFor="name" className="block text-sm font-medium">
                Your name
                <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
              </label>

              <label htmlFor="workspace" className="block text-sm font-medium">
                Workspace name
                <input id="workspace" name="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Acme Dental" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
              </label>
            </>
          )}

          <label htmlFor="email" className="block text-sm font-medium">
            Email
            <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
          </label>

          <label htmlFor="password" className="block text-sm font-medium">
            Password
            <input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete={isSignup ? "new-password" : "current-password"} aria-describedby={isSignup ? "password-help" : undefined} className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
            {isSignup && <span id="password-help" className="mt-1 block text-xs text-[#6b7c72]">Use at least 12 characters.</span>}
          </label>

          {error && <div id="auth-error" role="alert" aria-live="polite" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

          <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#173b2f] px-4 py-3 font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173b2f] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Working..." : isSignup ? "Create MERIT workspace" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-6 text-[#6b7c72]">
          {isSignup ? "By creating an account, you acknowledge that you have read our " : "By signing in, you agree to use MERIT in accordance with our "}
          <a href="/privacy" className="font-semibold text-[#315b49] underline underline-offset-2">Privacy Policy</a>.
        </p>

        <button type="button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(""); }} className="mt-5 w-full rounded-lg py-2 text-sm font-medium text-[#557565] hover:text-[#173b2f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173b2f]">
          {isSignup ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
      </div>
    </main>
  );
}
