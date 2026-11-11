"use client";

import { useCallback, useEffect, useState } from "react";

type Finding = {
  id: string;
  hunterType: string;
  detector: string;
  ruleVersion: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  confidence: number;
  severity: string;
  createdAt: string;
};

type Artifact = {
  id: string;
  sha256: string;
  sizeBytes: string;
  contentType: string | null;
  storageState: string;
  scannerVerdict: string;
  scannerName: string | null;
  scannerVersion: string | null;
  scannedAt: string | null;
  retainedUntil: string | null;
  createdAt: string;
};

type HunterRun = {
  id: string;
  hunterType: string;
  engine: string;
  engineVersion: string | null;
  status: string;
  attemptCount: number;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type Approval = {
  id: string;
  actionType: string;
  status: string;
  reason: string;
  expiresAt: string;
  createdAt: string;
};

type Incident = {
  id: string;
  status: string;
  severity: string;
  confidence: number;
  source: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  workspaceScoped: boolean;
  findings: Finding[];
  artifacts: Artifact[];
  hunterRuns: HunterRun[];
  approvals: Approval[];
};

function dateLabel(value: string): string {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function severityClass(severity: string): string {
  return severity === "CRITICAL" || severity === "HIGH"
    ? "rounded-full bg-[#f6e9e5] px-2.5 py-1 text-xs font-semibold text-[#8b493b]"
    : "rounded-full bg-[#f0eee5] px-2.5 py-1 text-xs font-semibold text-[#68746b]";
}

export function PlatformRedSquid({ canApprove }: { canApprove: boolean }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/security-incidents?limit=25", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load Red Squid incidents");
      setIncidents(data.incidents ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Red Squid incidents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(approval: Approval, decision: "APPROVE" | "DENY") {
    if (!canApprove || busyId) return;
    if (approval.actionType === "DISPOSE" && decision === "APPROVE" &&
        !window.confirm("Approve this disposal request? This records permission only; it does not delete the quarantined original.")) {
      return;
    }
    setBusyId(approval.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/platform/security-approvals/${encodeURIComponent(approval.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to record Founder decision");
      setMessage(decision === "APPROVE"
        ? "Approval recorded. No file operation has been executed; the worker remains disabled."
        : "Request denied. The original artifact remains quarantined.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record Founder decision");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = incidents.reduce((count, incident) => count + incident.approvals.length, 0);

  return (
    <section className="mt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#557565]">Red Squid · Security Warden</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#123c2d]">Incident watch</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756e]">
            Correlated findings, quarantined artefacts, and explicit Founder decisions. Customer content and raw artefact locations are not shown here.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-[#cbd8ce] bg-white px-4 py-2.5 text-sm font-semibold text-[#315345] disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh incidents"}
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-[#dce2d8] bg-[#f7f6ef] p-4">
        <p className="text-sm font-semibold text-[#173b2f]">Foundation mode — scanning and execution are not active yet.</p>
        <p className="mt-1 text-sm leading-6 text-[#69756e]">
          This console records incidents and approval decisions. It does not execute suspicious files, unpack artefacts, restore uploads, or permanently delete anything.
        </p>
      </div>

      {message && <p role="status" className="mb-4 rounded-xl border border-[#cbd8ce] bg-white px-4 py-3 text-sm text-[#315345]">{message}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-[#e4d3cc] bg-white px-4 py-3 text-sm text-[#8b493b]">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-[#69756e]">
        <span className="rounded-full bg-[#e7eee9] px-3 py-1.5">{incidents.length} recent incident(s)</span>
        <span className="rounded-full bg-[#f0eee5] px-3 py-1.5">{pendingCount} pending Founder decision(s)</span>
      </div>

      {loading && incidents.length === 0 ? (
        <div className="rounded-2xl border border-[#dce2d8] bg-white/75 p-6 text-sm text-[#69756e]">Loading Red Squid incident feed…</div>
      ) : incidents.length === 0 ? (
        <div className="rounded-2xl border border-[#dce2d8] bg-white/75 p-6">
          <h3 className="font-semibold text-[#173b2f]">No incidents recorded</h3>
          <p className="mt-2 text-sm leading-6 text-[#69756e]">The incident store is ready. No detector or worker has reported a finding yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((incident) => (
            <article key={incident.id} className="overflow-hidden rounded-2xl border border-[#dce2d8] bg-white/75">
              <div className="border-b border-[#e5e9e3] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={severityClass(incident.severity)}>{incident.severity}</span>
                  <span className="rounded-full bg-[#f0eee5] px-2.5 py-1 text-xs font-semibold text-[#68746b]">{incident.status.replaceAll("_", " ")}</span>
                  <span className="text-xs text-[#718178]">{incident.source.replaceAll("_", " ")}</span>
                  {incident.workspaceScoped && <span className="text-xs text-[#718178]">Workspace-scoped</span>}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-[#173b2f]">{incident.summary}</h3>
                <p className="mt-2 text-xs text-[#718178]">
                  Confidence {incident.confidence}% · First seen {dateLabel(incident.firstSeenAt)} · Last seen {dateLabel(incident.lastSeenAt)}
                </p>
              </div>

              {incident.findings.length > 0 && (
                <div className="border-b border-[#e5e9e3] p-5">
                  <h4 className="text-sm font-semibold text-[#315345]">Findings ({incident.findings.length})</h4>
                  <ul className="mt-3 space-y-2">
                    {incident.findings.map((finding) => (
                      <li key={finding.id} className="rounded-xl bg-[#f7f6ef] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#173b2f]">{finding.detector}</span>
                          <span className={severityClass(finding.severity)}>{finding.severity}</span>
                          <span className="text-xs text-[#718178]">{finding.hunterType.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-[#69756e]">
                          {finding.filePath ?? "No file path"}{finding.lineStart ? ` · line ${finding.lineStart}${finding.lineEnd && finding.lineEnd !== finding.lineStart ? `–${finding.lineEnd}` : ""}` : ""}
                          {finding.ruleVersion ? ` · rule ${finding.ruleVersion}` : ""}
                          { ` · confidence ${finding.confidence}%` }
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {incident.artifacts.length > 0 && (
                <div className="border-b border-[#e5e9e3] p-5">
                  <h4 className="text-sm font-semibold text-[#315345]">Quarantined artefacts ({incident.artifacts.length})</h4>
                  <ul className="mt-3 space-y-2">
                    {incident.artifacts.map((artifact) => (
                      <li key={artifact.id} className="rounded-xl bg-[#f7f6ef] p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#173b2f]">{artifact.storageState.replaceAll("_", " ")}</span>
                          <span className={artifact.scannerVerdict === "CLEAN" ? "rounded-full bg-[#e7eee9] px-2.5 py-1 font-semibold text-[#315b49]" : "rounded-full bg-[#f0eee5] px-2.5 py-1 font-semibold text-[#68746b]"}>Scan: {artifact.scannerVerdict}</span>
                          <span className="text-[#718178]">{artifact.contentType ?? "Unknown type"} · {Number(artifact.sizeBytes).toLocaleString("en-GB")} bytes</span>
                        </div>
                        <p className="mt-1 break-all text-[11px] text-[#718178]">SHA-256: {artifact.sha256}</p>
                        {artifact.scannerName && <p className="mt-1 text-xs text-[#718178]">Scanner: {artifact.scannerName}{artifact.scannerVersion ? ` ${artifact.scannerVersion}` : ""}{artifact.scannedAt ? ` · ${dateLabel(artifact.scannedAt)}` : ""}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {incident.hunterRuns.length > 0 && (
                <div className="border-b border-[#e5e9e3] p-5">
                  <h4 className="text-sm font-semibold text-[#315345]">Hunter activity ({incident.hunterRuns.length})</h4>
                  <ul className="mt-3 space-y-2">
                    {incident.hunterRuns.map((run) => (
                      <li key={run.id} className="rounded-xl bg-[#f7f6ef] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#173b2f]">{run.hunterType.replaceAll("_", " ")} Hunter</span>
                          <span className="rounded-full bg-[#e7eee9] px-2.5 py-1 text-xs font-semibold text-[#315b49]">{run.status}</span>
                          <span className="text-xs text-[#718178]">{run.engine}{run.engineVersion ? ` · ${run.engineVersion}` : ""}</span>
                          <span className="text-xs text-[#718178]">Attempt {run.attemptCount}/3</span>
                        </div>
                        {run.summary && <p className="mt-2 text-xs leading-5 text-[#69756e]">{run.summary}</p>}
                        <p className="mt-1 text-[11px] text-[#718178]">Queued {dateLabel(run.createdAt)}{run.finishedAt ? ` · Finished ${dateLabel(run.finishedAt)}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {incident.approvals.length > 0 && (
                <div className="p-5">
                  <h4 className="text-sm font-semibold text-[#315345]">Founder decisions required ({incident.approvals.length})</h4>
                  <div className="mt-3 space-y-3">
                    {incident.approvals.map((approval) => (
                      <div key={approval.id} className="rounded-xl border border-[#e5e9e3] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#173b2f]">{approval.actionType.replaceAll("_", " ")}</p>
                          <p className="text-xs text-[#718178]">Expires {dateLabel(approval.expiresAt)}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#69756e]">{approval.reason}</p>
                        {canApprove ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" disabled={busyId !== null} onClick={() => void decide(approval, "APPROVE")} className="rounded-xl bg-[#173b2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                              {busyId === approval.id ? "Saving…" : "Approve"}
                            </button>
                            <button type="button" disabled={busyId !== null} onClick={() => void decide(approval, "DENY")} className="rounded-xl border border-[#d9c4bd] bg-white px-4 py-2 text-sm font-semibold text-[#8b493b] disabled:opacity-50">
                              Deny
                            </button>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-[#8b493b]">Only the Founder Super Admin can decide this request.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
