"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type RequestItem = {
  id: string;
  workspaceId: string;
  workspace: { name: string };
  scope: string;
  status: string;
  effectiveStatus: string;
  reason: string;
  requestedDurationMinutes: number;
  requestExpiresAt: string;
  expiresAt: string | null;
  createdAt: string;
};

const scopeLabels: Record<string, string> = {
  CUSTOMER_RECORDS_READ: "Customer records · read only",
  FEEDBACK_READ: "Feedback records · read only",
  FEEDBACK_REPLIES_READ: "Feedback replies · read only",
  FILE_ASSETS_READ: "Uploaded files · read only",
};

export function PlatformSupportRequests() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [scope, setScope] = useState("FEEDBACK_READ");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/support-requests", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load support requests");
      setRequests(data.requests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load support requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/support-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, scope, reason, durationMinutes: Number(durationMinutes) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit request");
      setWorkspaceId("");
      setReason("");
      setMessage("Request submitted. Business approval is required before any workspace data can be accessed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-3xl border border-[#dce2d8] bg-white/75 p-6 sm:p-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Business-controlled access</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#123c2d]">Request support authorization</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#69756e]">
          Every request is read-only, limited to one resource category, and expires after the approved period. A different workspace Owner or Admin must approve it. No access is granted when a request is submitted.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-[#dce2d8] bg-[#fbfaf5] p-5">
        <label className="text-sm font-medium text-[#315345]">
          Workspace ID
          <input required maxLength={128} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} placeholder="Paste the business workspace ID" className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f] outline-none focus:border-[#557565]" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#315345]">
            Exact access scope
            <select value={scope} onChange={(event) => setScope(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f]">
              {Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-[#315345]">
            Requested duration
            <select value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f]">
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="240">4 hours</option>
            </select>
          </label>
        </div>
        <label className="text-sm font-medium text-[#315345]">
          Reason for access
          <textarea required minLength={20} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the specific support issue and why this data category is necessary." className="mt-2 w-full rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-[#173b2f] outline-none focus:border-[#557565]" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-[#718178]">Requests expire if not reviewed within 24 hours. Write access is not available.</p>
          <button disabled={busy} className="rounded-xl bg-[#173b2f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit for business approval"}</button>
        </div>
      </form>

      {message && <p role="status" className="mt-4 rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-sm text-[#315345]">{message}</p>}

      <div className="mt-7">
        <h3 className="font-semibold text-[#173b2f]">Your support requests</h3>
        {loading ? <p className="mt-3 text-sm text-[#718178]">Loading requests…</p> : requests.length === 0 ? <p className="mt-3 text-sm text-[#718178]">No support access requests submitted.</p> : (
          <div className="mt-3 divide-y divide-[#e5e9e3] rounded-2xl border border-[#dce2d8] bg-white">
            {requests.map((item) => (
              <article key={item.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold text-[#173b2f]">{item.workspace.name}</p><p className="mt-1 text-xs text-[#718178]">{scopeLabels[item.scope] ?? item.scope} · {item.requestedDurationMinutes} minutes</p></div>
                  <span className={item.effectiveStatus === "APPROVED" ? "rounded-full bg-[#e7eee9] px-3 py-1 text-xs font-semibold text-[#315b49]" : item.effectiveStatus === "DENIED" || item.effectiveStatus === "REVOKED" ? "rounded-full bg-[#f6e9e5] px-3 py-1 text-xs font-semibold text-[#8b493b]" : "rounded-full bg-[#f0eee5] px-3 py-1 text-xs font-semibold text-[#68746b]"}>{item.effectiveStatus}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#52665a]">{item.reason}</p>
                {item.effectiveStatus === "APPROVED" && item.expiresAt && <p className="mt-2 text-xs text-[#718178]">Access expires {new Date(item.expiresAt).toLocaleString("en-GB")}.</p>}
                {item.effectiveStatus === "PENDING" && <p className="mt-2 text-xs text-[#718178]">Awaiting business decision · request deadline {new Date(item.requestExpiresAt).toLocaleString("en-GB")}.</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
