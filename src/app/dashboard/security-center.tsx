"use client";

import { useEffect, useState } from "react";

type Event = { id: string; type: string; severity: string; targetId: string | null; metadata: unknown; createdAt: string; actorUserId: string | null };

type ResponseData = { events: Event[]; counts: Record<string, number> };

export default function SecurityCenter({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/security/events?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Security events are unavailable.");
        return response.json() as Promise<ResponseData>;
      })
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Security events are unavailable."); });
    return () => { active = false; };
  }, [workspaceId]);

  if (error) return null;
  const high = (data?.counts.HIGH ?? 0) + (data?.counts.CRITICAL ?? 0);

  return (
    <section className="mt-10 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm sm:p-7" aria-labelledby="security-center-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Security Warden</p>
          <h2 id="security-center-title" className="mt-2 text-2xl font-semibold">Monitor the workspace signal.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#557565]">Security events are sanitized before storage. Review the last 30 days of unusual access, webhook failures, and quarantined uploads without exposing customer content.</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${high ? "bg-[#fff1e8] text-[#9b4b2e]" : "bg-[#e7eee9] text-[#315b49]"}`}>{high ? `${high} high-severity events` : "No high-severity events"}</div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[["CRITICAL", "Critical"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]].map(([key, label]) => <div key={key} className="rounded-2xl bg-[#f7f4ec] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718178]">{label}</p><p className="mt-2 text-2xl font-semibold text-[#123c2d]">{data?.counts[key] ?? 0}</p></div>)}
      </div>
      <div className="mt-5 divide-y divide-[#e4e9e3] rounded-2xl border border-[#dfe5dc]">
        {data?.events.length ? data.events.slice(0, 8).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium text-[#173b2f]">{event.type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[#718178]">{new Date(event.createdAt).toLocaleString()}</p></div><span className="text-xs font-semibold text-[#557565]">{event.severity}</span></div>) : <p className="p-5 text-sm text-[#718178]">No security events recorded yet.</p>}
      </div>
    </section>
  );
}
