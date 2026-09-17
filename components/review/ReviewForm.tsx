"use client";

import { useState, useTransition } from "react";
import type { ReviewDictionary } from "@/lib/i18n/dictionaries";
import { submitTestimonialAction } from "@/lib/testimonials/public-actions";

const STARS = [1, 2, 3, 4, 5];

export function ReviewForm({
  publicToken,
  authorName,
  dict,
}: {
  publicToken: string;
  authorName: string;
  dict: ReviewDictionary;
}) {
  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (rating === 0) {
      setError(dict.ratingRequired);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitTestimonialAction(publicToken, {
        rating,
        quote: quote.trim() || undefined,
      });
      if (result.ok) {
        setSucceeded(true);
        return;
      }
      setError(result.error === "rate_limited" ? dict.errorRateLimited : dict.errorGeneric);
    });
  }

  if (succeeded) {
    return (
      <div className="text-center">
        <h2 className="mb-[8px] text-balance font-display text-[21px] font-semibold text-on-surface">
          {dict.successTitle.replace("{name}", authorName)}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-on-surface-muted">{dict.successBody}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-md flex justify-center gap-[6px]">
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={String(value)}
            onClick={() => {
              setError(null);
              setRating(value);
            }}
            className={`text-[30px] leading-none ${value <= rating ? "text-warning" : "text-border"}`}
          >
            {value <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>

      <textarea
        value={quote}
        onChange={(e) => setQuote(e.target.value)}
        placeholder={dict.quotePlaceholder}
        rows={4}
        maxLength={2000}
        className="mb-md w-full resize-none rounded-md border border-border bg-surface p-md text-[13px] text-on-surface"
      />

      {error && <p className="mb-sm text-[12.5px] font-medium text-error">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-full bg-primary px-md py-[12px] text-[14px] font-medium text-on-primary disabled:opacity-50"
      >
        {pending ? dict.submitting : dict.submit}
      </button>

      <p className="mt-sm text-center text-[11px] text-on-surface-muted">
        {dict.postedAs.replace("{name}", authorName)}
      </p>
    </div>
  );
}
