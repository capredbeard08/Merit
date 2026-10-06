"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

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

    try {
      if (mode === "signup") {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
        });

        if (result.error) {
          throw new Error(result.error.message || "Unable to create account.");
        }

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
        const result = await authClient.signIn.email({
          email,
          password,
        });

        if (result.error) {
          throw new Error(result.error.message || "Unable to sign in.");
        }
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-16 text-[#173b2f]">
      <div className="mx-auto max-w-md">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#557565]">MERIT</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {mode === "signup" ? "Build your customer intelligence workspace." : "Welcome back."}
          </h1>
          <p className="mt-3 text-[#557565]">
            Your customer data stays yours. MERIT turns feedback into useful action.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
          {mode === "signup" && (
            <>
              <label className="block text-sm font-medium">
                Your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f]"
                />
              </label>

              <label className="block text-sm font-medium">
                Workspace name
                <input
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="organization"
                  placeholder="Acme Dental"
                  className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f]"
                />
              </label>
            </>
          )}

          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f]"
            />
          </label>

          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              maxLength={128}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f]"
            />
            {mode === "signup" && (
              <span className="mt-1 block text-xs text-[#6b7c72]">Use at least 12 characters.</span>
            )}
          </label>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#173b2f] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Working..." : mode === "signup" ? "Create MERIT workspace" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
          }}
          className="mt-5 w-full text-sm font-medium text-[#557565] hover:text-[#173b2f]"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
      </div>
    </main>
  );
}
