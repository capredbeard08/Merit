"use client";

import { useState } from "react";

type Props = { publicId: string };

const ratingLabels = ["Poor", "Fair", "Good", "Very good", "Excellent"];

export default function GuestFeedbackForm({ publicId }: Props) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating < 1 || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const submissionKey = crypto.randomUUID();
      const response = await fetch("/api/public/guest-feedback/" + encodeURIComponent(publicId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message, submissionKey }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.accepted) {
        setError(result?.error || "We couldn't submit your feedback. Please try again.");
        return;
      }
      setGoogleReviewUrl(typeof result.googleReviewUrl === "string" ? result.googleReviewUrl : null);
      setComplete(true);
    } catch {
      setError("A connection issue interrupted submission. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div className="mt-8 rounded-2xl border border-[#d8e4d7] bg-[#f0f5ed] p-6" role="status" aria-live="polite">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dcebdc] text-xl text-[#174b35]" aria-hidden="true">✓</div>
        <h2 className="mt-4 text-xl font-semibold text-[#123c2d]">Thank you for sharing.</h2>
        <p className="mt-2 text-sm leading-6 text-[#586a5e]">Your feedback has been received and shared with the establishment.</p>
        {googleReviewUrl && (
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123c2d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18563b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2d]"
          >
            Also share on Google
          </a>
        )}
        <p className="mt-3 text-xs leading-5 text-[#718178]">Sharing on Google is optional. Your feedback here is valuable on its own.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8">
      <fieldset>
        <legend className="text-sm font-semibold text-[#243c30]">How would you rate your experience?</legend>
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3" role="group" aria-label="Choose a rating from one to five stars">
          {ratingLabels.map((label, index) => {
            const value = index + 1;
            const selected = rating === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={value + " out of 5: " + label}
                aria-pressed={selected}
                className={"flex h-12 w-12 items-center justify-center rounded-xl border text-2xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174b35] " +
                  (selected ? "border-[#174b35] bg-[#e7eee0] text-[#174b35]" : "border-[#dce2d8] bg-white text-[#a8b0a8] hover:border-[#91a997] hover:text-[#b18a43]")}
              >
                ★
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-5 text-xs text-[#718178]" aria-live="polite">
          {rating ? ratingLabels[rating - 1] : "Select a star rating"}
        </p>
      </fieldset>

      <label htmlFor="guest-message" className="mt-6 block text-sm font-semibold text-[#243c30]">
        Anything you'd like us to know? <span className="font-normal text-[#879189]">(optional)</span>
      </label>
      <textarea
        id="guest-message"
        value={message}
        onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
        maxLength={2000}
        rows={4}
        placeholder="What did you enjoy, or what could we improve?"
        className="mt-3 w-full resize-y rounded-xl border border-[#dce2d8] bg-[#fffefa] px-4 py-3 text-sm leading-6 text-[#17211c] outline-none transition placeholder:text-[#a0aaa1] focus:border-[#63846e] focus:ring-2 focus:ring-[#e2ecdf]"
      />
      <div className="mt-1 text-right text-xs text-[#879189]">{message.length}/2000</div>

      {error && <p className="mt-4 rounded-lg bg-[#fff0ed] px-3 py-2 text-sm text-[#9c382b]" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={rating < 1 || submitting}
        className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#123c2d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18563b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2d] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
