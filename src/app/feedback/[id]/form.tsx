"use client";

import { useState } from "react";

export default function FeedbackForm({ feedbackId, token }: { feedbackId: string; token: string }) {
  const [rating, setRating] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const response = await fetch("/api/public/feedback/" + feedbackId, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, rating: Number(rating), message, email: email || undefined }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not submit feedback."); return; }
    setDone(true);
  }

  if (done) return <div className="mt-7 rounded-2xl bg-[#edf2eb] p-5">Thank you. Your feedback has been recorded.</div>;

  return (
    <div className="mt-7 space-y-5">
      <div>
        <label className="text-sm font-medium">Rating</label>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1,2,3,4,5].map((value) => (
            <button key={value} onClick={() => setRating(String(value))} className={"rounded-xl border px-3 py-3 text-lg " + (rating === String(value) ? "border-[#173b2f] bg-[#edf2eb]" : "border-[#cfd9cf]")}>{value}</button>
          ))}
        </div>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what you really think…" rows={5} className="w-full rounded-xl border border-[#cfd9cf] bg-white px-4 py-3 outline-none" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional, if you'd like a response)" type="email" className="w-full rounded-xl border border-[#cfd9cf] bg-white px-4 py-3 outline-none" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={!rating || !message.trim()} onClick={submit} className="w-full rounded-xl bg-[#173b2f] px-4 py-3 font-medium text-white disabled:opacity-50">Submit feedback</button>
    </div>
  );
}
