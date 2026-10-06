"use client";

import { useState } from "react";

type Branch = { id: string; name: string; externalId: string | null };

export default function BranchManager({ workspaceId, initialBranches }: { workspaceId: string; initialBranches: Branch[] }) {
  const [branches, setBranches] = useState(initialBranches);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addBranch() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name }),
      });
      const data = await response.json();
      if (response.ok) {
        setBranches((current) => [...current, data.branch].sort((a, b) => a.name.localeCompare(b.name)));
        setName("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Branches</p>
      <div className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Victoria Island" className="min-w-0 flex-1 rounded-xl border border-[#cfd9cf] bg-white px-4 py-3 outline-none" />
        <button onClick={addBranch} disabled={busy} className="rounded-xl bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
      </div>
      <div className="mt-5 divide-y divide-[#dfe5dc]">
        {branches.map((branch) => <div key={branch.id} className="flex items-center justify-between py-3"><span>{branch.name}</span><span className="text-xs text-[#718178]">{branch.externalId || "No external ID"}</span></div>)}
        {!branches.length && <p className="py-3 text-sm text-[#718178]">No branches yet.</p>}
      </div>
    </section>
  );
}
