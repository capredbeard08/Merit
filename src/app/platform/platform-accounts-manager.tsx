"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Operator = {
  id: string;
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "FOUNDER_SUPER_ADMIN" | "PLATFORM_ADMIN" | "ENGINEER";
  revokedAt: string | null;
  createdAt: string;
};

export function PlatformAccountsManager({ canManage }: { canManage: boolean }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"PLATFORM_ADMIN" | "ENGINEER">("ENGINEER");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/operators", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load operators");
      setOperators(data.operators);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load operators");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to grant access");
      setEmail("");
      setMessage("Platform access granted.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to grant access");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(operator: Operator) {
    if (!window.confirm(`Revoke ${operator.role.replaceAll("_", " ")} access for ${operator.email}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/operators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: operator.userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to revoke access");
      setMessage("Platform access revoked.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Access governance</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#123c2d]">Platform operators</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756e]">
          Only verified registered accounts can be appointed. Founder access is created separately through the one-time bootstrap and cannot be granted or revoked here.
        </p>
      </div>

      {canManage && (
        <form onSubmit={grant} className="mb-6 grid gap-3 rounded-2xl border border-[#dce2d8] bg-white/75 p-5 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="text-sm font-medium text-[#315345]">
            Registered account email
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operator@example.com"
              className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f] outline-none focus:border-[#557565]"
            />
          </label>
          <label className="text-sm font-medium text-[#315345]">
            Platform role
            <select value={role} onChange={(event) => setRole(event.target.value as "PLATFORM_ADMIN" | "ENGINEER")} className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f]">
              <option value="ENGINEER">Engineer</option>
              <option value="PLATFORM_ADMIN">Platform Admin</option>
            </select>
          </label>
          <button disabled={busy} className="self-end rounded-xl bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">
            {busy ? "Working…" : "Grant access"}
          </button>
        </form>
      )}

      {message && <p role="status" className="mb-4 rounded-xl border border-[#dce2d8] bg-white/70 px-4 py-3 text-sm text-[#315345]">{message}</p>}

      <div className="overflow-hidden rounded-2xl border border-[#dce2d8] bg-white/75">
        {loading ? (
          <p className="p-6 text-sm text-[#69756e]">Loading platform operators…</p>
        ) : operators.length === 0 ? (
          <p className="p-6 text-sm text-[#69756e]">No platform operators have been assigned yet.</p>
        ) : (
          <div className="divide-y divide-[#e5e9e3]">
            {operators.map((operator) => (
              <article key={operator.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="font-semibold text-[#173b2f]">{operator.name || operator.email}</p>
                  <p className="mt-1 break-all text-sm text-[#69756e]">{operator.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[#e7eee9] px-3 py-1 text-[#315b49]">{operator.role.replaceAll("_", " ")}</span>
                    <span className="rounded-full bg-[#f0eee5] px-3 py-1 text-[#68746b]">{operator.emailVerified ? "Email verified" : "Email not verified"}</span>
                    <span className={operator.revokedAt ? "rounded-full bg-[#f6e9e5] px-3 py-1 text-[#8b493b]" : "rounded-full bg-[#e7eee9] px-3 py-1 text-[#315b49]"}>{operator.revokedAt ? "Revoked" : "Active"}</span>
                  </div>
                </div>
                {canManage && operator.role !== "FOUNDER_SUPER_ADMIN" && !operator.revokedAt && (
                  <button type="button" disabled={busy} onClick={() => void revoke(operator)} className="rounded-xl border border-[#d9c4bd] px-4 py-2 text-sm font-medium text-[#8b493b] disabled:opacity-50">
                    Revoke access
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#718178]">Showing up to 100 platform access records. Changes are recorded in the security event log. Business workspace permissions are unaffected.</p>
    </section>
  );
}
