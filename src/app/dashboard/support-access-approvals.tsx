"use client";

import { useCallback, useEffect, useState } from "react";

type SupportRequest = {
  id: string;
  requestedByUserId: string;
  scope: string;
  status: string;
  effectiveStatus: string;
  reason: string;
  requestedDurationMinutes: number;
  requestExpiresAt: string;
  expiresAt: string | null;
  createdAt: string;
  requestedBy: { name: string; email: string };
  decidedBy: { name: string; email: string } | null;
};

const labels: Record<string, string> = {
  CUSTOMER_RECORDS_READ: "Customer records · read only",
  FEEDBACK_READ: "Feedback records · read only",
  FEEDBACK_REPLIES_READ: "Feedback replies · read only",
  FILE_ASSETS_READ: "Uploaded files · read only",
};

export default function SupportAccessApprovals({ workspaceId, currentUserId }: { workspaceId: string; currentUserId: string }) {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/support-access`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load support requests");
      setRequests(data.requests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load support requests");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(item: SupportRequest, decision: "APPROVE" | "DENY" | "REVOKE") {
    if (item.requestedByUserId === currentUserId) {
      setMessage("You cannot approve your own support access request.");
      return;
    }
    if (decision === "REVOKE" && !window.confirm("Revoke this operator's support access immediately?")) return;
    setBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/support-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: item.id, decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update support access");
      setMessage(decision === "APPROVE" ? "Read-only support access approved." : decision === "DENY" ? "Support access request denied." : "Support access revoked.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update support access");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="merit-panel mt-6 p-6 sm:p-7" aria-labelledby="support-access-approvals-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">Business-controlled security</p>
        <h2 id="support-access-approvals-title" className="mt-2 text-xl font-semibold text-[#123c2d]">Support access approvals</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718178]">
          Your workspace Owner or Admin controls whether MERIT support staff can access a specific category of records. Approval is read-only, time-limited, and can be revoked at any time.
        </p>
      </div>
      {message && <p role="status" className="mt-4 rounded-xl border border-[#dce2d8] bg-white px-4 py-3 text-sm text-[#315345]">{message}</p>}
      {loading ? <p className="mt-5 text-sm text-[#718178]">Loading approval requests…</p> : requests.length === 0 ? (
        <p className="mt-5 rounded-xl bg-[#fbfaf5] p-4 text-sm text-[#718178]">No support access requests have been submitted for this workspace.</p>
      ) : (
        <div className="mt-5 divide-y divide-[#e5e9e3] rounded-2xl border border-[#dce2d8] bg-white">
          {requests.map((item) => (
            <article key={item.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#173b2f]">{item.requestedBy.name || item.requestedBy.email}</p>
                  <p className="mt-1 break-all text-xs text-[#718178]">{item.requestedBy.email}</p>
                </div>
                <span className={item.effectiveStatus === "APPROVED" ? "rounded-full bg-[#e7eee9] px-3 py-1 text-xs font-semibold text-[#315b49]" : item.effectiveStatus === "DENIED" || item.effectiveStatus === "REVOKED" ? "rounded-full bg-[#f6e9e5] px-3 py-1 text-xs font-semibold text-[#8b493b]" : "rounded-full bg-[#f0eee5] px-3 py-1 text-xs font-semibold text-[#68746b]"}>{item.effectiveStatus}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-[#315345]">{labels[item.scope] ?? item.scope} · {item.requestedDurationMinutes} minutes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#52665a]">{item.reason}</p>
              <p className="mt-2 text-xs text-[#718178]">Submitted {new Date(item.createdAt).toLocaleString("en-GB")}</p>
              {item.effectiveStatus === "PENDING" && (
                <p className="mt-1 text-xs text-[#718178]">Decision deadline {new Date(item.requestExpiresAt).toLocaleString("en-GB")}</p>
              )}
              {item.effectiveStatus === "APPROVED" && item.expiresAt && (
                <p className="mt-1 text-xs text-[#718178]">Access expires {new Date(item.expiresAt).toLocaleString("en-GB")}</p>
              )}
              {item.decidedBy && <p className="mt-1 text-xs text-[#718178]">Decision recorded by {item.decidedBy.name || item.decidedBy.email}</p>}
              {item.requestedByUserId === currentUserId ? (
                <p className="mt-3 text-xs font-medium text-[#8b493b]">You cannot approve your own request.</p>
              ) : item.effectiveStatus === "PENDING" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, "APPROVE")} className="rounded-xl bg-[#173b2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === item.id ? "Working…" : "Approve read-only access"}</button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, "DENY")} className="rounded-xl border border-[#d9c4bd] px-4 py-2 text-sm font-semibold text-[#8b493b] disabled:opacity-50">Deny request</button>
                </div>
              ) : item.effectiveStatus === "APPROVED" ? (
                <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, "REVOKE")} className="mt-4 rounded-xl border border-[#d9c4bd] px-4 py-2 text-sm font-semibold text-[#8b493b] disabled:opacity-50">Revoke access now</button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-[#718178]">No approval gives write access. Each support data read must be checked against the exact approved scope and recorded in the workspace audit history.</p>
    </section>
  );
}
