"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  branch: { id: string; name: string };
  customer: { id: string; name: string | null; email: string | null };
  replies: { id: string; rating: string | null; message: string | null; createdAt: string }[];
};
type Note = { id: string; note: string; createdAt: string; author: string };
type Counts = { new: number; reviewing: number; resolved: number; closed: number };
type Tab = "new" | "reviewing" | "resolved" | "closed";

const tabStatuses: Record<Tab, string[]> = {
  new: ["PENDING"],
  reviewing: ["CONTACTED", "CLICKED", "REPLIED"],
  resolved: ["RESOLVED"],
  closed: ["OPTED_OUT"],
};
const tabNames: { id: Tab; label: string; count: keyof Counts }[] = [
  { id: "new", label: "New", count: "new" },
  { id: "reviewing", label: "Reviewing", count: "reviewing" },
  { id: "resolved", label: "Resolved", count: "resolved" },
  { id: "closed", label: "Closed", count: "closed" },
];
const ratingValue: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const statusLabel: Record<string, string> = { PENDING: "New", CONTACTED: "Contacted", CLICKED: "Clicked", REPLIED: "Replied", RESOLVED: "Resolved", OPTED_OUT: "Closed" };

function initials(name: string | null) {
  return (name || "Customer").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
function dateLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " at " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function relativeLabel(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  if (hours < 1) return "Just now";
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day ago" : " days ago");
}

export default function FeedbackInbox({ workspaceId, initialItems, counts }: { workspaceId: string; initialItems: Item[]; counts: Counts }) {
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<Tab>("new");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [selectedId, setSelectedId] = useState(initialItems[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const filtered = useMemo(() => items.filter((item) => {
    const inTab = tabStatuses[tab].includes(item.status);
    const needle = query.trim().toLowerCase();
    const matches = !needle || [item.customer.name || "", item.customer.email || "", item.branch.name, ...item.replies.map((reply) => reply.message || "")].some((text) => text.toLowerCase().includes(needle));
    return inTab && matches;
  }).sort((a, b) => {
    if (sort === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
    if (sort === "lowest-rating") {
      const ar = a.replies[0]?.rating ? ratingValue[a.replies[0].rating] : 6;
      const br = b.replies[0]?.rating ? ratingValue[b.replies[0].rating] : 6;
      return ar - br || +new Date(b.createdAt) - +new Date(a.createdAt);
    }
    if (sort === "oldest-unresolved") return +new Date(a.createdAt) - +new Date(b.createdAt);
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  }), [items, tab, query, sort]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selected) { setNotes([]); return; }
    let cancelled = false;
    fetch(`/api/feedback/${encodeURIComponent(selected.id)}/notes?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load notes.")))
      .then((data) => { if (!cancelled) setNotes(data.notes || []); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [selected?.id, workspaceId]);

  async function saveNote() {
    if (!selected || !noteDraft.trim() || noteSaving) return;
    setNoteSaving(true);
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(selected.id)}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, note: noteDraft.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save note.");
      setNotes((current) => [...current, data.note]);
      setNoteDraft("");
      setNotice("Internal note saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save note."); }
    finally { setNoteSaving(false); }
  }

  async function changeStatus(item: Item, status: "CONTACTED" | "RESOLVED" | "OPTED_OUT") {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/feedback/" + encodeURIComponent(item.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update this feedback.");
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status, ...(status === "CONTACTED" ? { sentAt: new Date().toISOString() } : {}) } : entry));
      setNotice(status === "RESOLVED" ? "Feedback marked as resolved." : status === "CONTACTED" ? "Feedback marked as contacted." : "Customer marked as opted out.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-2 border-b border-[#e2e8e4]" role="tablist" aria-label="Feedback status">
        {tabNames.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => { setTab(entry.id); setNotice(""); }} className={"flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold " + (tab === entry.id ? "border-[#08745a] text-[#075b46]" : "border-transparent text-[#64746c] hover:text-[#1c3b30]")}>
          {entry.label}<span className={"rounded-full px-2 py-0.5 text-xs " + (tab === entry.id ? "bg-[#d9eee5] text-[#075b46]" : "bg-[#e8ece9] text-[#53645d]")}>{counts[entry.count]}</span>
        </button>)}
      </div>

      {notice ? <p role="status" className="mt-4 rounded-xl bg-[#e4f2e9] px-4 py-3 text-sm text-[#174b3b]">{notice}</p> : null}

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(310px,0.9fr)_minmax(0,1.25fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#e0e7e2] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#e7ece8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="sr-only" htmlFor="feedback-sort">Sort feedback</label>
            <select id="feedback-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border-0 bg-transparent py-2 text-sm text-[#53645d] focus:ring-2 focus:ring-[#7bb7a0]">
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="lowest-rating">Lowest rating first</option><option value="oldest-unresolved">Oldest open first</option>
            </select>
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-[#dfe7e2] px-3 py-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search feedback…" className="min-w-0 w-full border-0 bg-transparent text-sm outline-none placeholder:text-[#8a9891]" />
            </label>
          </div>
          <div className="max-h-[720px] overflow-y-auto">
            {filtered.map((item) => {
              const reply = item.replies[0];
              const active = selected?.id === item.id;
              return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={"flex w-full items-start gap-3 border-b border-[#edf0ed] p-4 text-left transition-colors last:border-0 hover:bg-[#f4f9f6] " + (active ? "border-l-[3px] border-l-[#08745a] bg-[#edf7f2] pl-[13px]" : "")}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e6f0eb] text-sm font-semibold text-[#174b3b]">{initials(item.customer.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[#16231d]">{item.customer.name || "Customer"}</span><span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + (item.status === "PENDING" ? "bg-[#fff0d8] text-[#80501c]" : item.status === "RESOLVED" ? "bg-[#dff3e7] text-[#185b40]" : item.status === "OPTED_OUT" ? "bg-[#e9ecea] text-[#58655e]" : "bg-[#e0edfc] text-[#235b91]")}>{statusLabel[item.status] || item.status}</span></span>
                  <span className="mt-1 block truncate text-sm text-[#4c5c54]">{reply?.message ? "“" + reply.message + "”" : item.customer.email || "No written feedback yet"}</span>
                  <span className="mt-1 block text-xs text-[#718078]">{item.branch.name} · {relativeLabel(item.createdAt)}</span>
                  <span className="mt-1 block text-xs font-semibold text-[#80501c]">{item.replies[0]?.rating ? `Customer rating: ${ratingValue[item.replies[0].rating]}/5` : "No rating given"}</span>
                </span>
                <span className="pt-3 text-lg text-[#73847b]" aria-hidden="true">›</span>
              </button>;
            })}
            {!filtered.length ? <div className="p-8 text-center"><p className="font-semibold text-[#233d32]">Nothing in this view</p><p className="mt-1 text-sm text-[#718078]">Try another status tab or search term.</p></div> : null}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[#e0e7e2] bg-white p-5 sm:p-7">
          {selected ? <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e9eeeb] pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e6f0eb] text-base font-semibold text-[#174b3b]">{initials(selected.customer.name)}</span>
                <div className="min-w-0"><h2 className="truncate text-xl font-semibold text-[#14231c]">{selected.customer.name || "Customer"}</h2><p className="mt-1 text-sm text-[#64746c]">{selected.branch.name} · {dateLabel(selected.createdAt)}</p>{selected.customer.email ? <a className="mt-1 block truncate text-sm text-[#28644f] underline underline-offset-2" href={"mailto:" + encodeURIComponent(selected.customer.email)}>{selected.customer.email}</a> : null}</div>
              </div>
              <span className="rounded-full bg-[#fff0d8] px-3 py-1.5 text-xs font-semibold text-[#80501c]">{statusLabel[selected.status] || selected.status}</span>
            </div>
            <div className="py-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#718078]">Full comment</h3>
              {selected.replies.length ? selected.replies.map((reply) => <article key={reply.id} className="mt-4 rounded-xl bg-[#f7f9f7] p-4">
                <p className="text-lg font-semibold leading-7 text-[#17251e]">{reply.message ? "“" + reply.message + "”" : "Rating submitted without a written comment."}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-[#64746c]">{dateLabel(reply.createdAt)}</span>
                  <span aria-label={reply.rating ? "Customer rating " + ratingValue[reply.rating] + " out of 5" : "No customer rating"} className="font-semibold text-[#8b5b19]">{reply.rating ? "★".repeat(ratingValue[reply.rating]) + "☆".repeat(5 - ratingValue[reply.rating]) + " " + ratingValue[reply.rating] + "/5" : "No rating"}</span>
                </div>
              </article>) : <p className="mt-4 rounded-xl bg-[#f7f9f7] p-4 text-sm leading-6 text-[#64746c]">No written reply has been received for this request yet.</p>}
            </div>
            <div className="border-t border-[#e9eeeb] pt-5">
              <h3 className="text-sm font-semibold text-[#233d32]">Internal notes</h3>
              <div className="mt-3 space-y-2">
                {notes.map((note) => <article key={note.id} className="rounded-lg bg-[#f7f9f7] p-3"><p className="whitespace-pre-wrap text-sm">{note.note}</p><p className="mt-2 text-xs text-[#718078]">{note.author} · {dateLabel(note.createdAt)}</p></article>)}
                {notes.length === 0 ? <p className="text-sm text-[#718078]">No internal notes yet.</p> : null}
              </div>
              <label htmlFor="internal-note" className="mt-3 block text-sm font-medium text-[#31483b]">Add an internal note</label>
              <textarea id="internal-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-[#dfe7e2] p-3 text-sm" placeholder="Record context for your team…" />
              <button type="button" onClick={() => void saveNote()} disabled={!noteDraft.trim() || noteSaving} className="mt-2 rounded-xl bg-[#075b46] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{noteSaving ? "Saving…" : "Save note"}</button>
              <h3 className="mt-6 text-sm font-semibold text-[#233d32]">Request timeline</h3>
              <div className="mt-3 space-y-2 text-sm text-[#64746c]">
                <p>Created · {dateLabel(selected.createdAt)}</p>
                {selected.sentAt ? <p>Request sent · {dateLabel(selected.sentAt)}</p> : null}
                {selected.clickedAt ? <p>Review link clicked · {dateLabel(selected.clickedAt)}</p> : null}
                {selected.repliedAt ? <p>Customer replied · {dateLabel(selected.repliedAt)}</p> : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {selected.customer.email ? <a href={"mailto:" + encodeURIComponent(selected.customer.email)} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd8d1] px-4 py-3 text-sm font-semibold text-[#1f3f32] hover:bg-[#f4f8f5]">✉ Contact customer</a> : null}
              {selected.status !== "RESOLVED" && selected.status !== "OPTED_OUT" ? <button type="button" disabled={busy} onClick={() => void changeStatus(selected, "RESOLVED")} className="inline-flex items-center gap-2 rounded-xl bg-[#075b46] px-5 py-3 text-sm font-semibold text-white hover:bg-[#064b3a] disabled:opacity-60">{busy ? "Saving…" : "✓ Mark resolved"}</button> : null}
              {selected.status !== "OPTED_OUT" && <button type="button" disabled={busy} onClick={() => void changeStatus(selected, "OPTED_OUT")} className="rounded-xl border border-[#e1d6c9] px-4 py-3 text-sm font-semibold text-[#80501c] hover:bg-[#fff8ee] disabled:opacity-60">Mark opted out</button>}
            </div>
          </> : <div className="flex min-h-80 flex-col items-center justify-center text-center"><span className="text-3xl text-[#9aaca2]">✳</span><h2 className="mt-3 text-lg font-semibold text-[#233d32]">Select a feedback request</h2><p className="mt-1 text-sm text-[#718078]">Choose a record from the list to review its details.</p></div>}
        </section>
      </div>
      <p className="mt-4 text-xs leading-5 text-[#7b8982]">Only feedback belonging to your authorised workspace is shown. Customer contact links open your email app; MERIT does not send an email automatically from this screen.</p>
    </div>
  );
}
