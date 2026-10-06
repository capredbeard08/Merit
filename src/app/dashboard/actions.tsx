"use client";

import { useState } from "react";

type Feedback = {
  id: string;
  status: string;
  createdAt: string;
  customer: { name: string | null; email: string | null };
  branch: { name: string };
};

const statuses = ["PENDING", "CONTACTED", "CLICKED", "REPLIED", "RESOLVED", "OPTED_OUT"];

export default function InboxActions({
  workspaceId,
  initialFeedback,
}: {
  workspaceId: string;
  initialFeedback: Feedback[];
}) {
  const [items, setItems] = useState(initialFeedback);
  const [busy, setBusy] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setBusy(id);
    try {
      const response = await fetch("/api/feedback/" + id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, status }),
      });
      if (!response.ok) return;
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-7 overflow-hidden rounded-2xl border border-[#dfe5dc]">
      {items.map((item) => (
        <div key={item.id} className="border-b border-[#dfe5dc] p-5 last:border-b-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{item.customer.name || item.customer.email || "Customer"}</p>
              <p className="text-sm text-[#718178]">{item.branch.name} · {new Date(item.createdAt).toLocaleString()}</p>
            </div>
            <span className="w-fit rounded-full bg-[#edf2eb] px-3 py-1 text-xs font-semibold tracking-wide">{item.status}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statuses.filter((status) => status !== item.status).map((status) => (
              <button
                key={status}
                disabled={busy === item.id}
                onClick={() => updateStatus(item.id, status)}
                className="rounded-full border border-[#cfd9cf] px-3 py-1.5 text-xs font-medium transition hover:bg-[#edf2eb] disabled:opacity-50"
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="p-8 text-sm text-[#718178]">No feedback records yet.</div>
      )}
    </div>
  );
}
