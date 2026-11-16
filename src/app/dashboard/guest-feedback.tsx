"use client";

import { useEffect, useMemo, useState } from "react";

type Branch = { id: string; name: string; externalId: string | null };
type QrCode = {
  id: string; publicId: string; branchId: string; label: string | null;
  status: "ACTIVE" | "PAUSED" | "REVOKED"; createdAt: string; lastUsedAt: string | null;
  publicUrl: string; _count: { feedback: number };
  branch: { name: string; archivedAt: string | null; googleReviewUrl: string | null };
};
type GuestFeedback = { id: string; rating: string; message: string | null; submittedAt: string; branch: { name: string } };
type Props = { workspaceId: string; branches: Branch[]; canManage: boolean; canUseAi: boolean };
const ratingNumber: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function qrImageUrl(value: string, size = 360) {
  // The QR image service receives only the public feedback URL; no customer or workspace data.
  return "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&format=png&margin=12&data=" + encodeURIComponent(value);
}

export default function GuestFeedbackManager({ workspaceId, branches, canManage, canUseAi }: Props) {
  const [codes, setCodes] = useState<QrCode[]>([]);
  const [feedback, setFeedback] = useState<GuestFeedback[]>([]);
  const [summary, setSummary] = useState({ count: 0, averageRating: null as number | null });
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [label, setLabel] = useState("");
  const [reviewUrls, setReviewUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<QrCode | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiConsentConfirmed, setAiConsentConfirmed] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ themes: Array<{ name: string; sentiment: "positive" | "mixed" | "negative"; mentions: number; summary: string; suggestedAction: string }>; overallSummary: string; priority: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/guest-feedback?workspaceId=" + encodeURIComponent(workspaceId), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not load guest feedback.");
      setCodes(data.codes || []);
      setFeedback(data.feedback || []);
      setSummary(data.summary || { count: 0, averageRating: null });
      const urls: Record<string, string> = {};
      for (const item of data.branches || []) urls[item.id] = item.googleReviewUrl || "";
      setReviewUrls(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load guest feedback.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setAiAnalysis(null);
    setAiConsentConfirmed(false);
    void load();
  }, [workspaceId]);

  const activeBranches = useMemo(() => branches, [branches]);
  const activeCodes = codes.filter((code) => code.status === "ACTIVE");
  const hasWrittenFeedback = feedback.some((item) => Boolean(item.message?.trim()));
  const average = summary.averageRating == null ? "—" : (summary.averageRating).toFixed(1) + "/5";

  async function runAiAnalysis() {
    if (aiBusy) return;
    setAiBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/guest-feedback/ai-insights", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, confirmExternalProcessing: aiConsentConfirmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "AI analysis is temporarily unavailable.");
      setAiAnalysis(data.analysis);
      setNotice("AI feedback themes generated. Review them as suggestions, not verified facts.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI analysis is temporarily unavailable.");
    } finally { setAiBusy(false); setAiConsentConfirmed(false); }
  }

  async function createCode() {
    if (!branchId || !canManage || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/guest-feedback", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, branchId, label }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not create QR code.");
      setLabel("");
      setNotice("Permanent QR code created.");
      await load();
      const created = data.code as QrCode;
      setSelected({ ...created, branch: { name: activeBranches.find(b => b.id === branchId)?.name || "Branch", archivedAt: null, googleReviewUrl: null }, _count: { feedback: 0 } });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create QR code."); }
    finally { setBusy(false); }
  }

  async function setStatus(code: QrCode, status: QrCode["status"]) {
    if (!canManage || busy) return;
    if (status === "REVOKED" && !window.confirm("Permanently revoke this QR code? It cannot be reactivated.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/guest-feedback/" + encodeURIComponent(code.id), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, status }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not update QR code.");
      setNotice(status === "REVOKED" ? "QR code permanently revoked." : "QR code status updated.");
      await load();
      setSelected(current => current?.id === code.id ? { ...current, status } : current);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update QR code."); }
    finally { setBusy(false); }
  }

  async function saveReviewUrl(id: string) {
    if (!canManage || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/guest-feedback", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, branchId: id, googleReviewUrl: reviewUrls[id]?.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not save review link.");
      setNotice("Google review destination saved.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save review link."); }
    finally { setBusy(false); }
  }

  function printTableTent(code: QrCode) {
    if (selected?.id !== code.id) setSelected(code);
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <section id="guest-feedback" className="mt-10 scroll-mt-5 rounded-3xl border border-[#dfe5dc] bg-white/85 p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">Guest feedback</p><h2 className="mt-1 text-2xl font-semibold text-[#123c2d]">In-person feedback, made simple</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#718178]">Create permanent QR codes for tables, counters and receipts. Guests can leave feedback without signing in.</p></div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-[#cfd9cf] px-4 py-2 text-sm font-semibold text-[#315b49] hover:bg-[#f4f6f0]">Refresh</button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#f2f5ef] p-4"><p className="text-xs text-[#718178]">Submissions</p><p className="mt-1 text-3xl font-semibold text-[#123c2d]">{summary.count.toLocaleString()}</p></div>
        <div className="rounded-2xl bg-[#f2f5ef] p-4"><p className="text-xs text-[#718178]">Average guest rating</p><p className="mt-1 text-3xl font-semibold text-[#123c2d]">{average}</p></div>
        <div className="rounded-2xl bg-[#f2f5ef] p-4"><p className="text-xs text-[#718178]">Active QR codes</p><p className="mt-1 text-3xl font-semibold text-[#123c2d]">{activeCodes.length}</p></div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#923c30]" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-[#edf5ed] px-4 py-3 text-sm text-[#315b49]" role="status">{notice}</p>}

      {canManage && <div className="mt-6 rounded-2xl border border-[#dfe5dc] p-4 sm:p-5">
        <h3 className="font-semibold text-[#183d2f]">Create a permanent QR code</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-semibold text-[#557565]">Branch
            <select value={branchId} onChange={e => setBranchId(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#cfd9cf] bg-white px-3 text-sm text-[#17211c]">
              {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[#557565]">Label (optional)
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Window table" className="mt-1 block min-h-11 w-full rounded-xl border border-[#cfd9cf] bg-white px-3 text-sm text-[#17211c]"/>
          </label>
          <button type="button" disabled={busy || !branchId} onClick={() => void createCode()} className="self-end rounded-xl bg-[#173b2f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Generate QR"}</button>
        </div>
      </div>}

      <div className="mt-7">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-[#183d2f]">Your QR codes</h3><span className="text-xs text-[#718178]">{codes.length} total</span></div>
        {loading ? <p className="py-6 text-sm text-[#718178]">Loading guest feedback…</p> : codes.length === 0 ? <p className="mt-3 rounded-xl bg-[#f5f6f1] p-5 text-sm text-[#718178]">No QR codes yet. Generate one for your first branch.</p> : (
          <div className="mt-3 divide-y divide-[#e4e9e3]">
            {codes.map(code => <div key={code.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#183d2f]">{code.label || code.branch.name}</p><span className={"rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide " + (code.status === "ACTIVE" ? "bg-[#e7f2e8] text-[#315b49]" : code.status === "PAUSED" ? "bg-[#f5f0df] text-[#856b2d]" : "bg-[#f8e8e5] text-[#923c30]")}>{code.status.toLowerCase()}</span></div>
                <p className="mt-1 text-xs text-[#718178]">{code.branch.name} · {code._count.feedback} submissions · Created {new Date(code.createdAt).toLocaleDateString()}</p>
                <button type="button" onClick={() => setSelected(code)} className="mt-2 text-xs font-semibold text-[#315b49] underline underline-offset-4">View QR and print options</button>
              </div>
              {canManage && <div className="flex flex-wrap gap-2">
                {code.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => void setStatus(code, "PAUSED")} className="rounded-lg border border-[#d8dfd6] px-3 py-2 text-xs font-semibold text-[#6d5b2e] disabled:opacity-50">Pause</button>}
                {code.status === "PAUSED" && <button type="button" disabled={busy} onClick={() => void setStatus(code, "ACTIVE")} className="rounded-lg border border-[#d8dfd6] px-3 py-2 text-xs font-semibold text-[#315b49] disabled:opacity-50">Reactivate</button>}
                {code.status !== "REVOKED" && <button type="button" disabled={busy} onClick={() => void setStatus(code, "REVOKED")} className="rounded-lg border border-[#ead8d4] px-3 py-2 text-xs font-semibold text-[#923c30] disabled:opacity-50">Revoke</button>}
              </div>}
            </div>)}
          </div>
        )}
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#10251c]/65 p-4" role="dialog" aria-modal="true" aria-labelledby="guest-qr-title">
        <div id="guest-qr-print-sheet" className="guest-qr-print-sheet my-auto w-full max-w-lg rounded-3xl bg-[#fbfaf5] p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">Permanent QR code</p><h3 id="guest-qr-title" className="mt-1 text-xl font-semibold text-[#123c2d]">{selected.label || selected.branch.name}</h3><p className="text-sm text-[#718178]">{selected.branch.name}</p><p className="mt-4 text-center text-xl font-semibold text-[#123c2d]">How was your experience?</p><p className="mt-1 text-center text-sm text-[#718178]">Scan the code to share your feedback.</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close QR preview" className="guest-qr-close rounded-full border border-[#dce2d8] px-3 py-1 text-lg">×</button></div>
          <div className="mx-auto mt-5 w-fit rounded-2xl border border-[#dce2d8] bg-white p-3"><img src={qrImageUrl(selected.publicUrl, 360)} width="260" height="260" alt={"QR code for " + selected.branch.name} className="h-[260px] w-[260px]"/></div>
          <p className="mt-3 break-all text-center text-xs text-[#718178]">{selected.publicUrl}</p>
          {selected.status !== "ACTIVE" && <p className="mt-3 rounded-lg bg-[#f5f0df] p-2 text-center text-xs text-[#856b2d]">This QR code is {selected.status.toLowerCase()} and will not accept submissions.</p>}
          <div className="guest-qr-print-controls mt-5 grid grid-cols-2 gap-2">
            <a href={qrImageUrl(selected.publicUrl, 1000)} download={"merit-guest-qr-" + selected.branch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png"} target="_blank" rel="noreferrer" className="rounded-xl border border-[#cfd9cf] px-3 py-3 text-center text-xs font-semibold text-[#315b49]">Download PNG</a>
            <button type="button" onClick={() => printTableTent(selected)} className="rounded-xl bg-[#173b2f] px-3 py-3 text-xs font-semibold text-white">Print table tent / Save PDF</button>
          </div>
          <button type="button" className="guest-qr-print-controls mt-2 w-full rounded-xl border border-[#cfd9cf] px-3 py-3 text-xs font-semibold text-[#315b49]" onClick={() => { void navigator.clipboard.writeText(selected.publicUrl); setNotice("Guest feedback link copied."); }}>Copy guest link</button>
          <p className="mt-3 text-[11px] leading-5 text-[#879189]">The QR image is rendered by a third-party QR service using only this public feedback URL. Do not encode private information in QR URLs.</p>
        </div>
      </div>}

      <div className="mt-8 border-t border-[#dfe5dc] pt-6">
        <h3 className="font-semibold text-[#183d2f]">Google review destinations</h3>
        <p className="mt-1 text-sm text-[#718178]">Guests see the same optional Google invitation after submitting feedback, regardless of their rating. No review gating.</p>
        <div className="mt-3 space-y-3">
          {activeBranches.map(branch => <div key={branch.id} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="text-xs font-semibold text-[#557565]">{branch.name}
              <input type="url" value={reviewUrls[branch.id] || ""} onChange={e => setReviewUrls(current => ({ ...current, [branch.id]: e.target.value }))} disabled={!canManage} placeholder="https://g.page/r/… or Google Maps review link" className="mt-1 block min-h-11 w-full rounded-xl border border-[#cfd9cf] bg-white px-3 text-sm font-normal text-[#17211c] disabled:bg-[#f3f4ef]"/>
            </label>
            {canManage && <button type="button" disabled={busy} onClick={() => void saveReviewUrl(branch.id)} className="self-end rounded-xl border border-[#cfd9cf] px-4 py-3 text-xs font-semibold text-[#315b49] disabled:opacity-50">Save link</button>}
          </div>)}
          {!activeBranches.length && <p className="text-sm text-[#718178]">Add a branch before configuring review destinations.</p>}
        </div>
      </div>

      <div className="mt-8 border-t border-[#dfe5dc] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-[#183d2f]">Latest guest submissions</h3><span className="text-xs text-[#718178]">Latest 50</span></div>
          {canUseAi ? <span className="text-xs text-[#718178]">AI analysis is available to your workspace role.</span> : <span className="text-xs text-[#718178]">AI analysis is not enabled for your workspace role.</span>}
        </div>
        {canUseAi && <div className="mt-4 rounded-2xl border border-[#dfe5dc] bg-[#f7f8f3] p-4">
          <p className="text-sm font-semibold text-[#183d2f]">External AI processing</p>
          <p className="mt-1 text-xs leading-5 text-[#59685f]">When you run this analysis, MERIT sends up to 100 recent written guest comments and their ratings to Groq. Email addresses, phone-like strings and URLs are pattern-redacted first. This is not guaranteed anonymisation: comments may still contain identifying or sensitive details. Review your feedback and do not submit sensitive information for external analysis.</p>
          <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#315b49]">
            <input type="checkbox" checked={aiConsentConfirmed} onChange={event => setAiConsentConfirmed(event.target.checked)} disabled={aiBusy} className="mt-1"/>
            <span>I understand that the selected workspace's recent written guest feedback will be sent to Groq for this analysis.</span>
          </label>
          <button type="button" disabled={!aiConsentConfirmed || aiBusy || loading || !hasWrittenFeedback} onClick={() => void runAiAnalysis()} className="mt-3 rounded-xl border border-[#cfd9cf] px-4 py-2 text-sm font-semibold text-[#315b49] disabled:opacity-50">{aiBusy ? "Analyzing…" : "Analyze feedback themes"}</button>
        </div>}
        {aiAnalysis && <div className="mt-4 rounded-2xl border border-[#dfe5dc] bg-[#f7f8f3] p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#557565]">AI-assisted summary</p>
          <p className="mt-2 text-sm leading-6 text-[#315b49]">{aiAnalysis.overallSummary}</p>
          <p className="mt-3 text-sm font-semibold text-[#183d2f]">Suggested priority</p>
          <p className="mt-1 text-sm leading-6 text-[#59685f]">{aiAnalysis.priority}</p>
          {aiAnalysis.themes.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{aiAnalysis.themes.map((theme, index) => <article key={theme.name + index} className="rounded-xl border border-[#e2e8df] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-[#183d2f]">{theme.name}</h4><span className="text-[10px] font-semibold uppercase tracking-wide text-[#718178]">{theme.sentiment} · {theme.mentions} mention{theme.mentions === 1 ? "" : "s"}</span></div>
            <p className="mt-2 text-sm leading-5 text-[#59685f]">{theme.summary}</p>
            <p className="mt-2 text-xs leading-5 text-[#315b49]">Next step: {theme.suggestedAction}</p>
          </article>)}</div>}
          <p className="mt-4 text-[11px] leading-5 text-[#879189]">AI-generated suggestions based on up to 100 recent written comments. Some common personal details are pattern-redacted before analysis; this does not guarantee anonymisation. Verify themes against the original feedback before acting.</p>
        </div>}
        {feedback.length ? <div className="mt-3 divide-y divide-[#e4e9e3]">{feedback.map(item => <article key={item.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#315b49]">{item.branch.name} · {"★".repeat(ratingNumber[item.rating] || 0)}{"☆".repeat(5-(ratingNumber[item.rating] || 0))}</p><time className="text-xs text-[#879189]">{new Date(item.submittedAt).toLocaleString()}</time></div>{item.message && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#59685f]">{item.message}</p>}</article>)}</div> : <p className="mt-3 rounded-xl bg-[#f5f6f1] p-5 text-sm text-[#718178]">Guest feedback will appear here once customers start submitting.</p>}
      </div>
    </section>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
