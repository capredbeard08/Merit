"use client";

import { useState } from "react";

type Member = { id: string; role: string; user: { email: string; name: string | null } };

export default function MemberManager({ workspaceId, initialMembers }: { workspaceId: string; initialMembers: Member[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function addMember() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, email, role }),
      });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Could not add member."); return; }
      setMembers((current) => [...current, data.member]);
      setEmail("");
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Team access</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" className="rounded-xl border border-[#cfd9cf] bg-white px-4 py-3 outline-none" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-[#cfd9cf] bg-white px-4 py-3">
          <option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="AGENT">Agent</option><option value="VIEWER">Viewer</option>
        </select>
        <button onClick={addMember} disabled={busy || !email} className="rounded-xl bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Adding…" : "Add member"}</button>
      </div>
      {message && <p className="mt-3 text-sm text-[#8b5e34]">{message}</p>}
      <div className="mt-5 divide-y divide-[#dfe5dc]">
        {members.map((member) => <div key={member.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{member.user.name || member.user.email}</p><p className="text-xs text-[#718178]">{member.user.email}</p></div><span className="rounded-full bg-[#edf2eb] px-3 py-1 text-xs font-semibold">{member.role}</span></div>)}
      </div>
    </section>
  );
}
