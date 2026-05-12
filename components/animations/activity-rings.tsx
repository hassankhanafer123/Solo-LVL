"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Apple-Fitness-style triple ring chart.
 * Three concentric rings rendered with stroke-dasharray. Each ring fills
 * smoothly from 0 to its target percentage on mount and animates when the
 * value changes.
 */

export type Ring = {
  label: string;
  /** 0..1 */
  progress: number;
  /** CSS gradient stop colors */
  gradient: [string, string];
  /** Glow color */
  glow: string;
  value: string;
  goal: string;
};

export function ActivityRings({
  rings,
  size = 280,
  centerLabel,
  centerValue,
}: {
  rings: [Ring, Ring, Ring];
  size?: number;
  centerLabel: string;
  centerValue: string;
}) {
  const reduce = useReducedMotion();
  const stroke = Math.max(14, Math.round(size * 0.075));
  const gap = Math.round(stroke * 0.6);

  // Three radii, outer to inner
  const radii = [
    size / 2 - stroke / 2 - 4,
    size / 2 - stroke - gap - stroke / 2 - 4,
    size / 2 - 2 * (stroke + gap) - stroke / 2 - 4,
  ];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Soft outer glow */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full blur-3xl opacity-50"
        style={{
          background: `conic-gradient(from 0deg, ${rings[0].glow}55, ${rings[1].glow}55, ${rings[2].glow}55, ${rings[0].glow}55)`,
        }}
      />

      <svg viewBox={`0 0 ${size} ${size}`} className="relative h-full w-full -rotate-90">
        <defs>
          {rings.map((r, i) => (
            <linearGradient key={i} id={`ring-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={r.gradient[0]} />
              <stop offset="100%" stopColor={r.gradient[1]} />
            </linearGradient>
          ))}
          <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {rings.map((r, i) => {
          const radius = radii[i]!;
          const c = 2 * Math.PI * radius;
          const filled = c * Math.min(1, Math.max(0, r.progress));
          return (
            <g key={i}>
              {/* Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={stroke}
                strokeLinecap="round"
              />
              {/* Glow trail (subtle) */}
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`url(#ring-${i})`}
                strokeWidth={stroke * 1.05}
                strokeLinecap="round"
                strokeDasharray={c}
                initial={reduce ? false : { strokeDashoffset: c }}
                animate={{ strokeDashoffset: c - filled }}
                transition={{ duration: 1.4, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                style={{ filter: "url(#ring-glow)", opacity: 0.55 }}
              />
              {/* Crisp ring */}
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`url(#ring-${i})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                initial={reduce ? false : { strokeDashoffset: c }}
                animate={{ strokeDashoffset: c - filled }}
                transition={{ duration: 1.4, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              />
            </g>
          );
        })}
      </svg>

      {/* Center text */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400">
          {centerLabel}
        </div>
        <div className="mt-1 font-display text-6xl text-white leading-none tabular-nums">
          {centerValue}
        </div>
      </div>
    </div>
  );
}

/** Animated counter that ticks from `from` to `to` over `duration` ms. */
export function CountUp({
  to,
  from = 0,
  duration = 1200,
  format = (n) => n.toString(),
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [value, setValue] = useState(from);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const startVal = value;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(Math.round(startVal + (to - startVal) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return <span className={className}>{format(value)}</span>;
}
