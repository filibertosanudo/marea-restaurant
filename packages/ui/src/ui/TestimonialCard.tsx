type TestimonialCardProps = {
  quote: string;
  name: string;
  avatarSrc?: string;
  /** Decorative, per-quote context only — see docs/prompts/15 for why the landing never shows a computed average rating. */
  rating?: number | null;
};

export function TestimonialCard({ quote, name, avatarSrc, rating }: TestimonialCardProps) {
  return (
    <div className="w-[260px] rounded-lg border border-surface-ocean-border bg-surface-ocean p-lg">
      <div className="relative mb-sm h-[40px] w-[40px] overflow-hidden rounded-full bg-primary">
        {avatarSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {rating != null && (
        <span aria-hidden className="mb-[2px] block text-[11px] tracking-[1px] text-primary">
          {"★".repeat(rating)}
          {"☆".repeat(5 - rating)}
        </span>
      )}
      <p className="text-sm text-on-surface">&ldquo;{quote}&rdquo;</p>
      <p className="mt-sm text-[13px] font-medium text-on-surface">{name}</p>
    </div>
  );
}
