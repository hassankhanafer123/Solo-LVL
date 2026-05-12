/**
 * Per-stat animated SVG art. Each illustration is hand-built with smooth
 * looping animations that convey the meaning of the stat:
 *   STR — barbell lifting (power)
 *   VIT — heart beating + ECG pulse (life force)
 *   AGI — lightning bolt with energy bursts (speed)
 *   INT — rotating knowledge crystal with orbiting electrons (mind)
 *   PER — radar sweep with target rings (awareness)
 *
 * All animations are CSS keyframes — zero JS overhead per frame.
 * Respects prefers-reduced-motion via global rule in globals.css.
 */

import type { StatKind as Stat } from "@/lib/types";

const SIZE_CLASS = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
  xl: "h-40 w-40",
};

type Size = keyof typeof SIZE_CLASS;

export function StatArt({ stat, size = "md", active = false }: { stat: Stat; size?: Size; active?: boolean }) {
  const cls = `${SIZE_CLASS[size]} drop-shadow-[0_0_20px_var(--art-glow)]`;
  switch (stat) {
    case "STR":
      return <StrengthArt className={cls} active={active} />;
    case "VIT":
      return <VitalityArt className={cls} active={active} />;
    case "AGI":
      return <AgilityArt className={cls} active={active} />;
    case "INT":
      return <IntellectArt className={cls} active={active} />;
    case "PER":
      return <PerceptionArt className={cls} active={active} />;
  }
}

/* ============================ STR — Barbell ============================ */
function StrengthArt({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ["--art-glow" as string]: "rgba(244,63,94,0.45)" }}
      aria-label="Strength"
    >
      <defs>
        <radialGradient id="strBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="strPlate" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#strBg)" />
      <g className={active ? "[animation:str-lift_1.6s_ease-in-out_infinite]" : "[animation:str-lift_2.8s_ease-in-out_infinite]"} style={{ transformOrigin: "50% 50%" }}>
        {/* Bar */}
        <rect x="20" y="48" width="60" height="4" rx="2" fill="#cbd5e1" />
        {/* Grip texture */}
        <rect x="42" y="48" width="16" height="4" fill="#475569" />
        {/* Left plates */}
        <rect x="18" y="36" width="6" height="28" rx="2" fill="url(#strPlate)" />
        <rect x="10" y="40" width="6" height="20" rx="2" fill="url(#strPlate)" />
        {/* Right plates */}
        <rect x="76" y="36" width="6" height="28" rx="2" fill="url(#strPlate)" />
        <rect x="84" y="40" width="6" height="20" rx="2" fill="url(#strPlate)" />
      </g>
      {/* Impact line that compresses */}
      <line
        x1="20"
        y1="84"
        x2="80"
        y2="84"
        stroke="#fb7185"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
        className="[animation:str-ground_1.6s_ease-in-out_infinite]"
        style={{ transformOrigin: "50% 84px" }}
      />
    </svg>
  );
}

/* ============================ VIT — Heart + ECG ============================ */
function VitalityArt({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ["--art-glow" as string]: "rgba(16,185,129,0.45)" }}
      aria-label="Vitality"
    >
      <defs>
        <radialGradient id="vitBg" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vitHeart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#vitBg)" />
      {/* Heart with beat */}
      <g
        className={active ? "[animation:vit-beat_0.9s_ease-in-out_infinite]" : "[animation:vit-beat_1.4s_ease-in-out_infinite]"}
        style={{ transformOrigin: "50% 45%" }}
      >
        <path
          d="M50 60 C 42 52, 28 48, 28 38 C 28 30, 36 26, 42 30 C 46 32, 48 36, 50 40 C 52 36, 54 32, 58 30 C 64 26, 72 30, 72 38 C 72 48, 58 52, 50 60 Z"
          fill="url(#vitHeart)"
          stroke="#10b981"
          strokeWidth="0.8"
        />
      </g>
      {/* ECG sweep line */}
      <g>
        <line x1="12" y1="76" x2="88" y2="76" stroke="#064e3b" strokeWidth="1" opacity="0.5" />
        <path
          d="M12 76 L 32 76 L 38 70 L 44 82 L 50 64 L 56 82 L 62 70 L 68 76 L 88 76"
          fill="none"
          stroke="#34d399"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="200"
          className="[animation:vit-ecg_2.2s_linear_infinite]"
        />
      </g>
    </svg>
  );
}

/* ============================ AGI — Lightning ============================ */
function AgilityArt({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ["--art-glow" as string]: "rgba(245,158,11,0.5)" }}
      aria-label="Agility"
    >
      <defs>
        <radialGradient id="agiBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="agiBolt" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#agiBg)" />
      {/* Speed lines */}
      <g
        className="[animation:agi-streak_1.6s_linear_infinite]"
        stroke="#fbbf24"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
      >
        <line x1="18" y1="35" x2="32" y2="35" />
        <line x1="14" y1="50" x2="32" y2="50" />
        <line x1="18" y1="65" x2="30" y2="65" />
      </g>
      {/* Lightning bolt */}
      <g
        className={active ? "[animation:agi-pulse_0.8s_ease-in-out_infinite]" : "[animation:agi-pulse_1.6s_ease-in-out_infinite]"}
        style={{ transformOrigin: "50% 50%" }}
      >
        <path
          d="M58 18 L 38 52 L 50 52 L 42 82 L 66 44 L 54 44 Z"
          fill="url(#agiBolt)"
          stroke="#fde68a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </g>
      {/* Spark particles */}
      <g className="[animation:agi-sparks_1.6s_ease-out_infinite]">
        <circle cx="72" cy="32" r="1.5" fill="#fde68a" />
        <circle cx="78" cy="56" r="1.2" fill="#fbbf24" />
        <circle cx="28" cy="72" r="1.3" fill="#fde68a" />
        <circle cx="22" cy="24" r="1" fill="#fbbf24" />
      </g>
    </svg>
  );
}

/* ============================ INT — Crystal & orbits ============================ */
function IntellectArt({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ["--art-glow" as string]: "rgba(59,130,246,0.5)" }}
      aria-label="Intellect"
    >
      <defs>
        <radialGradient id="intBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="intCrystal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#intBg)" />
      {/* Orbits */}
      <g
        className={active ? "[animation:int-spin_4s_linear_infinite]" : "[animation:int-spin_8s_linear_infinite]"}
        style={{ transformOrigin: "50% 50%" }}
      >
        <ellipse cx="50" cy="50" rx="34" ry="14" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.4" />
        <circle cx="84" cy="50" r="2.2" fill="#60a5fa" />
      </g>
      <g
        className={active ? "[animation:int-spin-reverse_5s_linear_infinite]" : "[animation:int-spin-reverse_10s_linear_infinite]"}
        style={{ transformOrigin: "50% 50%" }}
      >
        <ellipse cx="50" cy="50" rx="14" ry="34" fill="none" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.4" />
        <circle cx="50" cy="84" r="2.2" fill="#a78bfa" />
      </g>
      {/* Crystal (diamond) */}
      <g
        className="[animation:int-pulse_2.4s_ease-in-out_infinite]"
        style={{ transformOrigin: "50% 50%" }}
      >
        <path
          d="M50 28 L 64 50 L 50 72 L 36 50 Z"
          fill="url(#intCrystal)"
          stroke="#dbeafe"
          strokeWidth="0.8"
        />
        {/* Inner highlight */}
        <path d="M50 28 L 56 50 L 50 72" stroke="#dbeafe" strokeWidth="0.6" fill="none" opacity="0.7" />
      </g>
    </svg>
  );
}

/* ============================ PER — Radar ============================ */
function PerceptionArt({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ["--art-glow" as string]: "rgba(168,85,247,0.45)" }}
      aria-label="Perception"
    >
      <defs>
        <radialGradient id="perBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="perSweep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#perBg)" />
      {/* Concentric rings */}
      <g fill="none" stroke="#a855f7" strokeWidth="0.8" opacity="0.4">
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="22" />
        <circle cx="50" cy="50" r="32" />
        <circle cx="50" cy="50" r="42" />
      </g>
      {/* Crosshairs */}
      <g stroke="#a855f7" strokeWidth="0.5" opacity="0.35">
        <line x1="50" y1="6" x2="50" y2="94" />
        <line x1="6" y1="50" x2="94" y2="50" />
      </g>
      {/* Radar sweep */}
      <g
        className={active ? "[animation:per-spin_2s_linear_infinite]" : "[animation:per-spin_4s_linear_infinite]"}
        style={{ transformOrigin: "50% 50%" }}
      >
        <path d="M50 50 L 92 50 A 42 42 0 0 0 70 14 Z" fill="url(#perSweep)" />
        <line x1="50" y1="50" x2="92" y2="50" stroke="#d8b4fe" strokeWidth="1.4" />
      </g>
      {/* Target blip */}
      <circle
        cx="68"
        cy="36"
        r="2.4"
        fill="#d8b4fe"
        className="[animation:per-blip_2s_ease-in-out_infinite]"
      />
      {/* Center */}
      <circle cx="50" cy="50" r="2.5" fill="#a855f7" />
    </svg>
  );
}
