"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import MeritMark from "@/components/MeritMark";

type Stage = "credentials" | "verification" | "workspace";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [stage, setStage] = useState<Stage>("credentials");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function continueIfAuthenticated() {
    const sessionResult = await authClient.getSession();
    if (!sessionResult.data?.session) return false;

    const response = await fetch("/api/workspaces", { method: "GET", cache: "no-store" });
    if (!response.ok) return false;
    const body = await response.json();
    if (body.workspace) {
      sessionStorage.removeItem("merit.pendingWorkspaceName");
      router.replace("/dashboard");
      router.refresh();
      return true;
    }

    const pendingName = sessionStorage.getItem("merit.pendingWorkspaceName");
    if (pendingName) setWorkspace(pendingName);
    setStage("workspace");
    setNotice("Your email is verified. Finish setting up your workspace.");
    return true;
  }

  useEffect(() => {
    let active = true;
    async function initialise() {
      try {
        const sessionResult = await authClient.getSession();
        if (!active || !sessionResult.data?.session) return;
        const response = await fetch("/api/workspaces", { method: "GET", cache: "no-store" });
        if (!active || !response.ok) return;
        const body = await response.json();
        if (body.workspace) {
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        const pendingName = sessionStorage.getItem("merit.pendingWorkspaceName");
        if (pendingName) setWorkspace(pendingName);
        setStage("workspace");
        if (searchParams.get("verified") === "1") {
          setNotice("Email verified successfully. Finish setting up your workspace.");
        }
      } catch (cause) {
        console.error("[MERIT auth] session initialisation failed", cause);
      }
    }
    void initialise();
    return () => { active = false; };
  }, [router, searchParams]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspace }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) {
          setStage("credentials");
          setMode("signin");
          throw new Error("Your session has expired. Sign in again to create your workspace.");
        }
        throw new Error(body?.error || "Workspace setup failed. Please try again.");
      }
      sessionStorage.removeItem("merit.pendingWorkspaceName");
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        sessionStorage.setItem("merit.pendingWorkspaceName", workspace.trim());
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: "/auth?verified=1",
        });
        if (result.error) {
          sessionStorage.removeItem("merit.pendingWorkspaceName");
          console.error("[MERIT auth] signup rejected", { code: result.error.code ?? null, status: result.error.status ?? null });
          throw new Error(result.error.message || result.error.code || "Unable to create account.");
        }
        setStage("verification");
        setNotice("We’ve sent a verification link to your email. Verify your address, then return here to finish creating your workspace.");
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message || "Unable to sign in.");
        const continued = await continueIfAuthenticated();
        if (!continued) throw new Error("We couldn't confirm your session. Please try signing in again.");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong.";
      console.error("[MERIT auth] flow failed", { stage: mode, error: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const showWorkspace = stage === "workspace";
  const showVerification = stage === "verification";

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-16 text-[#173b2f]">
      <div className="mx-auto max-w-md">
        <div className="mb-10">
          <div className="merit-brand"><MeritMark size={48} /><span className="merit-brand-name">MERIT</span></div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">
            {showWorkspace ? "Workspace setup" : showVerification ? "Verify your email" : isSignup ? "Create an account" : "Workspace access"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {showWorkspace ? "Give your workspace a name." : showVerification ? "One quick step before you begin." : isSignup ? "Create your MERIT account." : "Welcome back."}
          </h1>
          <p className="mt-3 text-[#557565]">Your customer data stays yours. MERIT turns feedback into useful action.</p>
        </div>

        {notice && <div role="status" className="mb-4 rounded-xl border border-[#c9d9cc] bg-[#edf4ed] px-4 py-3 text-sm leading-6 text-[#315b49]">{notice}</div>}

        {showVerification ? (
          <div className="space-y-4 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
            <p className="text-sm leading-7 text-[#557565]">Check your inbox{email ? ` (${email})` : ""} and follow the verification link. Your workspace name has been saved on this device, so you won’t have to enter it again.</p>
            <button type="button" onClick={() => { setMode("signin"); setStage("credentials"); setError(""); }} className="w-full rounded-xl bg-[#173b2f] px-4 py-3 font-semibold text-white">I’ve verified my email — sign in</button>
          </div>
        ) : showWorkspace ? (
          <form onSubmit={createWorkspace} className="space-y-4 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
            <label htmlFor="workspace" className="block text-sm font-medium">
              Workspace name
              <input id="workspace" name="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Acme Dental" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
            </label>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#173b2f] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Creating workspace..." : "Create workspace"}</button>
          </form>
        ) : (
          <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined} className="space-y-4 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm">
            {isSignup && (
              <label htmlFor="name" className="block text-sm font-medium">
                Your name
                <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
              </label>
            )}
            {isSignup && (
              <label htmlFor="workspace" className="block text-sm font-medium">
                Workspace name
                <input id="workspace" name="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Acme Dental" className="mt-2 w-full rounded-xl border border-[#d7ded6] bg-white px-4 py-3 outline-none focus:border-[#173b2f] focus-visible:ring-2 focus-visible:ring-[#47795f]" />
              </label>
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
              {busy ? "Working..." : isSignup ? "Create MERIT account" : "Sign in"}
            </button>
          </form>
        )}

        {!showVerification && !showWorkspace && (
          <>
            <p className="mt-5 text-center text-xs leading-6 text-[#6b7c72]">
              {isSignup ? "By creating an account, you acknowledge that you have read our " : "By signing in, you agree to use MERIT in accordance with our "}
              <a href="/privacy" className="font-semibold text-[#315b49] underline underline-offset-2">Privacy Policy</a>.
            </p>
            <button type="button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(""); setNotice(""); }} className="mt-5 w-full rounded-lg py-2 text-sm font-medium text-[#557565] hover:text-[#173b2f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173b2f]">
              {isSignup ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
