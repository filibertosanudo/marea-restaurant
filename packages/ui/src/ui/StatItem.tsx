"use client";

import { useEffect, useRef, useState } from "react";

function parseValue(value: string) {
  const match = value.match(/^(\D*)(\d+)(\D*)$/);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  return { prefix, target: parseInt(digits, 10), suffix };
}

export function StatItem({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);
  const [display, setDisplay] = useState(() => {
    const parsed = parseValue(value);
    return parsed ? `${parsed.prefix}0${parsed.suffix}` : value;
  });

  useEffect(() => {
    const parsed = parseValue(value);
    const node = ref.current;
    if (!parsed || !node) {
      setDisplay(value);
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // One-time read of a browser-only API (matchMedia) — this can't be
      // decided during the initial render without risking a mismatch with
      // the server-rendered animated-start value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || animated.current) return;
        animated.current = true;
        observer.disconnect();

        const duration = 1200;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(parsed.target * eased);
          setDisplay(`${parsed.prefix}${current}${parsed.suffix}`);
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={ref}
      className="w-[130px] rounded-md bg-surface p-md text-center shadow-1"
    >
      <div className="font-display text-[28px] font-semibold text-primary">
        {display}
      </div>
      <div className="mt-[4px] text-[12px] text-on-surface-muted">{label}</div>
    </div>
  );
}
