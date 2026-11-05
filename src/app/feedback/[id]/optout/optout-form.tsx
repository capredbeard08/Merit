"use client";

import { useState } from "react";

export default function OptOutForm({ feedbackId, token }: { feedbackId: string; token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function confirmOptOut() {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/feedback/" + encodeURIComponent(feedbackId) + "/optout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "We could not process your request. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("We could not process your request. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-2xl bg-[#edf2eb] p-5">
        You’re opted out. You will no longer receive feedback requests from this business.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={confirmOptOut}
        disabled={submitting}
        className="rounded-xl bg-[#173b2f] px-5 py-3 font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Processing…" : "Confirm opt-out"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
