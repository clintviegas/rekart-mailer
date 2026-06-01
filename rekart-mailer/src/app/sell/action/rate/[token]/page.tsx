"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { publicActionService } from "@/services/public-action.service";
import {
  ActionShell,
  LoadingCard,
  ErrorCard,
} from "../../_components/action-shell";

export default function RatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [customerName, setName] = useState<string | null>(null);
  const [requestId, setReqId]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [rating, setRating]     = useState(0);
  const [hover, setHover]       = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSub]    = useState(false);
  const [submitted, setSent]    = useState(false);
  const [finalRating, setFinal] = useState(0);

  useEffect(() => {
    publicActionService
      .rateView(token)
      .then((r) => { setName(r.data.customerName); setReqId(r.data.requestId); })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setSub(true);
    try {
      await publicActionService.rateSubmit(token, { rating, feedback });
      setFinal(rating);
      setSent(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSub(false);
    }
  }

  if (!customerName && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;

  if (submitted) {
    return (
      <ActionShell icon="⭐" title="Thank You!" subtitle={`Request ${requestId}`}>
        <div className="text-center py-4">
          <div className="text-5xl mb-3">
            {"⭐".repeat(finalRating)}
          </div>
          <p className="text-slate-700 font-semibold text-base mb-1">
            {finalRating >= 4 ? "We're glad you had a great experience!" : "Thank you for your feedback."}
          </p>
          <p className="text-slate-500 text-sm">
            Your rating has been recorded. We'll use it to improve our service.
          </p>
        </div>
      </ActionShell>
    );
  }

  return (
    <ActionShell icon="⭐" title="Rate Your Experience" subtitle={`Request ${requestId}`}>
      <p className="text-sm text-slate-600 mb-5">
        Hi <strong>{customerName}</strong>, how was your experience with us?
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Star selector */}
        <div className="flex justify-center gap-2 py-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(star)}
              className="text-4xl transition-transform hover:scale-110 focus:outline-none"
            >
              <span className={(hover || rating) >= star ? "text-amber-400" : "text-slate-200"}>
                ★
              </span>
            </button>
          ))}
        </div>

        {rating > 0 && (
          <p className="text-center text-sm font-medium text-slate-700">
            {rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Great" : "Excellent!"}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Feedback (optional)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="Tell us about your experience…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !rating}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Rating"}
        </button>
      </form>
    </ActionShell>
  );
}
