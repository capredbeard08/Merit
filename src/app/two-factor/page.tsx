"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"totp" | "backup">("totp");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = method === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim(), disableSession: false, trustDevice: false });
      if (result.error) {
        setMessage(result.error.message || "The code could not be verified. Try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage("Verification failed. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f0e7] px-5 py-12 text-[#173b2f]">
      <section className="mx-auto max-w-md rounded-2xl border border-[#d9dfd4] bg-[#fbfaf6] p-7 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#587466]">MERIT SECURITY</p>
        <h1 className="mt-3 text-2xl font-semibold">Verify it’s you</h1>
        <p className="mt-2 text-sm leading-6 text-[#586b61]">Enter the code from your authenticator app, or use one of your saved backup codes. Your session will not be created until verification succeeds.</p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => { setMethod("totp"); setCode(""); setMessage(""); }} className={method === "totp" ? "rounded-lg bg-[#173b2f] px-4 py-2 text-sm text-white" : "rounded-lg border border-[#cbd5cc] px-4 py-2 text-sm"}>Authenticator code</button>
          <button type="button" onClick={() => { setMethod("backup"); setCode(""); setMessage(""); }} className={method === "backup" ? "rounded-lg bg-[#173b2f] px-4 py-2 text-sm text-white" : "rounded-lg border border-[#cbd5cc] px-4 py-2 text-sm"}>Backup code</button>
        </div>
        <form onSubmit={verify} className="mt-5 space-y-4">
          <label className="block text-sm font-medium" htmlFor="two-factor-code">{method === "totp" ? "6-digit authenticator code" : "Unused backup code"}</label>
          <input id="two-factor-code" autoComplete="one-time-code" inputMode={method === "totp" ? "numeric" : "text"} value={code} onChange={(event) => setCode(event.target.value)} required maxLength={method === "totp" ? 6 : 32} className="w-full rounded-lg border border-[#cbd5cc] bg-white px-3 py-3 text-base tracking-widest outline-none focus:border-[#173b2f]" />
          {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
          <button disabled={busy || !code.trim()} className="w-full rounded-lg bg-[#173b2f] px-4 py-3 font-medium text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify and continue"}</button>
        </form>
        <p className="mt-5 text-xs leading-5 text-[#68796f]">If you no longer have access to your authenticator or backup codes, use the account recovery process. Do not share verification codes with anyone.</p>
      </section>
    </main>
  );
}
