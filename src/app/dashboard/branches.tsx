"use client";

import { useState } from "react";

type Branch = { id: string; name: string; externalId: string | null };

export default function BranchManager({ workspaceId, initialBranches, initialArchivedBranches, canManage }: { workspaceId: string; initialBranches: Branch[]; initialArchivedBranches: Branch[]; canManage: boolean }) {
  const [branches, setBranches] = useState(initialBranches);
  const [archivedBranches, setArchivedBranches] = useState(initialArchivedBranches);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addBranch() {
    if (!name.trim() || !canManage) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not add branch.");
      setBranches((current) => [...current, data.branch].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add branch."); }
    finally { setBusy(false); }
  }

  async function archiveBranch(branch: Branch) {
    if (!window.confirm("Archive " + branch.name + "? Its feedback and service history will be preserved.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/branches/" + encodeURIComponent(branch.id) + "?workspaceId=" + encodeURIComponent(workspaceId), { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not archive branch.");
      setBranches(current => current.filter(item => item.id !== branch.id));
      setArchivedBranches(current => [...current, branch]);
      setMessage("Branch archived. Its historical records have been preserved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not archive branch."); }
    finally { setBusy(false); }
  }

  async function restoreBranch(branch: Branch) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/branches/" + encodeURIComponent(branch.id) + "/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not restore branch.");
      setArchivedBranches(current => current.filter(item => item.id !== branch.id));
      setBranches(current => [...current, data.branch].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage("Branch restored.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not restore branch."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Branches</p>
      {canManage && <div className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Victoria Island" className="min-w-0 flex-1 rounded-xl border border-[#cfd9cf] bg-white px-4 py-3 outline-none" />
        <button onClick={addBranch} disabled={busy} className="rounded-xl bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Working…" : "Add"}</button>
      </div>}
      {message && <p role="status" className="mt-3 text-sm text-[#557565]">{message}</p>}
      <div className="mt-5 divide-y divide-[#dfe5dc]">
        {branches.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><span>{item.name}</span><p className="text-xs text-[#718178]">{item.externalId || "No external ID"}</p></div>{canManage && <button type="button" disabled={busy} onClick={() => void archiveBranch(item)} className="text-xs font-semibold text-[#8a3e2e] underline underline-offset-4 disabled:opacity-50">Archive</button>}</div>)}
        {!branches.length && <p className="py-3 text-sm text-[#718178]">No active branches.</p>}
      </div>
      {canManage && <div className="mt-6 border-t border-[#dfe5dc] pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#718178]">Archived branches</p>
        <div className="mt-2 divide-y divide-[#e4e9e3]">
          {archivedBranches.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-[#718178]">{item.name}</span><button type="button" disabled={busy} onClick={() => void restoreBranch(item)} className="text-xs font-semibold text-[#173b2f] underline underline-offset-4 disabled:opacity-50">Restore</button></div>)}
          {!archivedBranches.length && <p className="py-3 text-sm text-[#718178]">No archived branches.</p>}
        </div>
      </div>}
    </section>
  );
}
