"use client";

import { cn } from "@/lib/utils";

/** Infinite horizontal marquee. Pass items; they tile twice for the loop. */
export function Marquee({
  items,
  speed = "normal",
  reverse,
  className,
}: {
  items: React.ReactNode[];
  speed?: "slow" | "normal" | "fast";
  reverse?: boolean;
  className?: string;
}) {
  const duration =
    speed === "slow" ? "60s" : speed === "fast" ? "20s" : "36s";

  return (
    <div className={cn("relative overflow-hidden mask-fade-x", className)}>
      <div
        className={cn("flex w-max gap-12 will-change-transform", reverse ? "animate-marquee-rev" : "animate-marquee")}
        style={{ animationDuration: duration }}
      >
        {[...items, ...items].map((it, i) => (
          <div key={i} className="shrink-0 flex items-center gap-12">
            {it}
            <Diamond />
          </div>
        ))}
      </div>
    </div>
  );
}

function Diamond() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-blue-400/60" fill="currentColor" aria-hidden>
      <path d="M6 0 L12 6 L6 12 L0 6 Z" />
    </svg>
  );
}
