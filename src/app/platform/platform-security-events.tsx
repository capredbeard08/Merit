"use client";

import { useCallback, useEffect, useState } from "react";

type SecurityEvent = {
  id: string;
  type: string;
  severity: string;
  actorUserId: string | null;
  targetId: string | null;
  metadata: Record<string, string>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export function PlatformSecurityEvents({ canExport }: { canExport: boolean }) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async (cursor?: string | null, append = false) => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "25" });
    if (severity) params.set("severity", severity);
    if (type) params.set("type", type);
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/platform/security-events?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load security events");
      setEvents((current) => append ? [...current, ...data.events] : data.events);
      setNextCursor(data.nextCursor);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load security events");
    } finally {
      setLoading(false);
    }
  }, [severity, type]);

  useEffect(() => { void refresh(null, false); }, [refresh]);

  async function exportCsv() {
    setMessage("");
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (severity) params.set("severity", severity);
      if (type) params.set("type", type);
      const response = await fetch(`/api/platform/security-events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Unable to export security events");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "merit-platform-security-events.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export security events");
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Governance and accountability</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#123c2d]">Security event history</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756e]">
            Platform-level access events only. Workspace audit records and customer content are excluded.
          </p>
        </div>
        {canExport && (
          <button type="button" onClick={() => void exportCsv()} className="rounded-xl border border-[#cbd8ce] bg-white px-4 py-2.5 text-sm font-semibold text-[#315345] hover:bg-[#f5f7f4]">
            Export CSV
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <label className="text-sm text-[#52675b]">
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="ml-2 rounded-lg border border-[#dce2d8] bg-white px-3 py-2 text-[#173b2f]">
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className="text-sm text-[#52675b]">
          Event
          <select value={type} onChange={(event) => setType(event.target.value)} className="ml-2 rounded-lg border border-[#dce2d8] bg-white px-3 py-2 text-[#173b2f]">
            <option value="">All platform events</option>
            <option value="FOUNDER_SUPER_ADMIN_BOOTSTRAPPED">Founder bootstrap</option>
            <option value="PLATFORM_ACCESS_GRANTED">Operator granted</option>
            <option value="PLATFORM_ACCESS_REINSTATED">Operator reinstated</option>
            <option value="PLATFORM_ACCESS_REVOKED">Operator revoked</option>
          </select>
        </label>
      </div>

      {message && <p role="status" className="mb-4 rounded-xl border border-[#e4d3cc] bg-white px-4 py-3 text-sm text-[#8b493b]">{message}</p>}

      <div className="overflow-hidden rounded-2xl border border-[#dce2d8] bg-white/75">
        {loading && events.length === 0 ? (
          <p className="p-6 text-sm text-[#69756e]">Loading security history…</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-[#69756e]">No matching platform security events.</p>
        ) : (
          <div className="divide-y divide-[#e5e9e3]">
            {events.map((event) => (
              <article key={event.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#173b2f]">{event.type.replaceAll("_", " ")}</span>
                    <span className={event.severity === "CRITICAL" || event.severity === "HIGH" ? "rounded-full bg-[#f6e9e5] px-2.5 py-1 text-xs font-semibold text-[#8b493b]" : "rounded-full bg-[#f0eee5] px-2.5 py-1 text-xs font-semibold text-[#68746b]"}>{event.severity}</span>
                  </div>
                  <time className="text-xs text-[#718178]" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-[#69756e] sm:grid-cols-2">
                  <div><dt className="inline font-semibold text-[#52675b]">Actor: </dt><dd className="inline break-all">{event.actorUserId ?? "System / unknown"}</dd></div>
                  <div><dt className="inline font-semibold text-[#52675b]">Target: </dt><dd className="inline break-all">{event.targetId ?? "—"}</dd></div>
                  {event.metadata.role && <div><dt className="inline font-semibold text-[#52675b]">Role: </dt><dd className="inline">{event.metadata.role.replaceAll("_", " ")}</dd></div>}
                  {event.metadata.previousRole && <div><dt className="inline font-semibold text-[#52675b]">Previous role: </dt><dd className="inline">{event.metadata.previousRole.replaceAll("_", " ")}</dd></div>}
                  {event.metadata.reason && <div className="sm:col-span-2"><dt className="inline font-semibold text-[#52675b]">Reason: </dt><dd className="inline break-words">{event.metadata.reason.replaceAll("_", " ")}</dd></div>}
                  {event.ipAddress && <div><dt className="inline font-semibold text-[#52675b]">IP: </dt><dd className="inline">{event.ipAddress}</dd></div>}
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[#718178]">Showing {events.length} event(s). Each page contains up to 25 records.</p>
        {nextCursor && (
          <button type="button" disabled={loading} onClick={() => void refresh(nextCursor, true)} className="rounded-xl border border-[#cbd8ce] bg-white px-4 py-2 text-sm font-semibold text-[#315345] disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
