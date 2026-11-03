"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function AccountSecurityPage() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/account/security", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { twoFactorEnabled?: boolean };
        if (active) setEnabled(data.twoFactorEnabled === true);
      })
      .catch(() => {
        if (active) setMessage("Could not load your security status. Refresh the page and try again.");
      });
    return () => { active = false; };
  }, []);

  async function beginEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.enable({ password, method: "totp", issuer: "MERIT" });
      if (result.error) {
        setMessage(result.error.message || "Two-factor enrollment could not start.");
        return;
      }
      if (result.data?.method === "totp") {
        setTotpURI(result.data.totpURI);
        setBackupCodes(result.data.backupCodes);
        setMessage("Enrollment started. Add the authenticator to your app, then verify a current code below.");
      }
    } catch {
      setMessage("Two-factor enrollment could not start. Sign in again and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false });
      if (result.error) {
        setMessage(result.error.message || "The authenticator code was not accepted.");
        return;
      }
      setEnabled(true);
      setTotpURI("");
      setCode("");
      setMessage("Two-factor authentication is enabled. Keep your backup codes somewhere private and secure.");
    } catch {
      setMessage("Could not verify the authenticator code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(label + " copied. Keep it private and secure.");
    } catch {
      setMessage("Clipboard access was unavailable. Copy the information manually and store it securely.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f0e7] px-5 py-10 text-[#173b2f]">
      <section className="mx-auto max-w-2xl rounded-2xl border border-[#d9dfd4] bg-[#fbfaf6] p-7 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#587466]">MERIT ACCOUNT</p>
        <h1 className="mt-3 text-2xl font-semibold">Account security</h1>
        <p className="mt-2 text-sm leading-6 text-[#586b61]">Set up an authenticator app for an additional sign-in factor. Time-based codes work offline and do not require paid email or SMS delivery.</p>
        {enabled ? (
          <div className="mt-6 rounded-xl border border-[#b7cbbd] p-4">
            <p className="font-medium">Authenticator-based two-factor authentication is enabled for this account.</p>
            <p className="mt-1 text-sm text-[#586b61]">Backup codes are displayed only once when they are generated. If you did not save them, regenerate a new set from your security settings before relying on them.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {backupCodes.map((item) => <code key={item} className="rounded bg-[#eef0e9] p-2 text-center text-sm">{item}</code>)}
            </div>
            <button type="button" onClick={() => copyText(backupCodes.join("\n"), "Backup codes")} className="mt-3 rounded-lg border border-[#cbd5cc] px-3 py-2 text-sm">Copy backup codes</button>
          </div>
        ) : !totpURI ? (
          <form onSubmit={beginEnrollment} className="mt-6 space-y-4">
            <label htmlFor="current-password" className="block text-sm font-medium">Confirm your current password</label>
            <input id="current-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 outline-none focus:border-[#173b2f]" />
            <button disabled={busy || !password} className="rounded-lg bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Starting…" : "Set up authenticator"}</button>
          </form>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-[#cbd5cc] p-4">
              <h2 className="font-semibold">1. Add MERIT to your authenticator</h2>
              <p className="mt-2 text-sm text-[#586b61]">Use your authenticator app's manual setup option. This URI contains your authenticator secret; do not share it or send it to anyone.</p>
              <code className="mt-3 block break-all rounded-lg bg-[#eef0e9] p-3 text-xs">{totpURI}</code>
              <button type="button" onClick={() => copyText(totpURI, "Authenticator setup URI")} className="mt-3 rounded-lg border border-[#cbd5cc] px-3 py-2 text-sm">Copy setup URI</button>
            </div>
            <div className="rounded-xl border border-[#cbd5cc] p-4">
              <h2 className="font-semibold">2. Save your one-time backup codes</h2>
              <p className="mt-2 text-sm text-[#586b61]">Each code can be used once if you lose your authenticator. Store them somewhere private.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {backupCodes.map((item) => <code key={item} className="rounded bg-[#eef0e9] p-2 text-center text-sm">{item}</code>)}
              </div>
              <button type="button" onClick={() => copyText(backupCodes.join("\n"), "Backup codes")} className="mt-3 rounded-lg border border-[#cbd5cc] px-3 py-2 text-sm">Copy backup codes</button>
            </div>
            <form onSubmit={confirmEnrollment} className="space-y-3 rounded-xl border border-[#cbd5cc] p-4">
              <h2 className="font-semibold">3. Verify the authenticator</h2>
              <label htmlFor="enrollment-code" className="block text-sm">Enter the current 6-digit code</label>
              <input id="enrollment-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} required className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 tracking-widest outline-none focus:border-[#173b2f]" />
              <button disabled={busy || code.trim().length !== 6} className="rounded-lg bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Verifying…" : "Confirm and enable MFA"}</button>
            </form>
          </div>
        )}
        {message && <p role="status" className="mt-4 text-sm text-[#586b61]">{message}</p>}
        <p className="mt-6 text-xs leading-5 text-[#68796f]">Do not close this page until you have saved the backup codes. If you lose both your authenticator and backup codes, automated MFA recovery is not yet available. Contact MERIT support before making changes to your account.</p>
      </section>
    </main>
  );
}
