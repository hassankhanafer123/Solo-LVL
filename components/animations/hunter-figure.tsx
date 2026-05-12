"use client";

import { motion, AnimatePresence } from "motion/react";
import type { StatKind } from "@/lib/types";

/**
 * <HunterFigure /> — the central "you" figure.
 *
 * Shows a stylized hooded hunter silhouette. When a stat is being interacted
 * with, the camera zooms into the relevant body region and a detailed,
 * stat-specific anatomy animation plays on top:
 *
 *   STR → chest (flexing muscle fibers)
 *   VIT → heart (anatomical heart with pumping blood)
 *   AGI → legs  (running motion + kinetic lines)
 *   INT → head  (neural synapses firing)
 *   PER → eyes  (scanning iris with radar lines)
 *
 * The viewBox is animated smoothly via framer-motion spring physics, giving a
 * cinematic camera move from a wide shot of the figure to an extreme close-up.
 */

export type ZoomTarget = "full" | StatKind;

const STAT_TO_ZOOM: Record<StatKind, ZoomTarget> = {
  STR: "STR",
  VIT: "VIT",
  AGI: "AGI",
  INT: "INT",
  PER: "PER",
};
export { STAT_TO_ZOOM };

/* ---- viewBox per zoom target (full figure is 0 0 200 400) ---- */
const VIEWBOX = {
  full: { x: 0, y: 0, w: 200, h: 400 },
  INT: { x: 55, y: 0, w: 90, h: 90 },   // head / brain
  PER: { x: 70, y: 32, w: 60, h: 36 },  // eyes
  STR: { x: 35, y: 80, w: 130, h: 90 }, // chest + biceps
  VIT: { x: 65, y: 105, w: 70, h: 60 }, // heart
  AGI: { x: 50, y: 220, w: 100, h: 140 }, // legs
} as const;

const STAT_TINT: Record<StatKind, string> = {
  STR: "rgba(244,63,94,0.4)",
  VIT: "rgba(16,185,129,0.4)",
  AGI: "rgba(245,158,11,0.45)",
  INT: "rgba(59,130,246,0.4)",
  PER: "rgba(168,85,247,0.4)",
};

export function HunterFigure({
  zoom = "full",
  className = "",
}: {
  zoom?: ZoomTarget;
  className?: string;
}) {
  const v = VIEWBOX[zoom];
  const viewBoxStr = `${v.x} ${v.y} ${v.w} ${v.h}`;

  return (
    <div className={`relative ${className}`}>
      {/* Background glow tinted by active stat */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-2xl blur-3xl pointer-events-none"
        initial={false}
        animate={{
          backgroundColor: zoom === "full" ? "rgba(59,130,246,0.18)" : STAT_TINT[zoom],
        }}
        transition={{ duration: 0.8 }}
      />

      {/* Camera viewport */}
      <div className="relative aspect-[5/8] w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/60 to-slate-950">
        {/* Hex grid scan lines */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 4px)",
          }}
        />

        {/* The figure */}
        <motion.svg
          viewBox={viewBoxStr}
          initial={false}
          animate={{ viewBox: viewBoxStr } as any}
          transition={{ type: "spring", stiffness: 90, damping: 22, mass: 1.2 }}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="hunterBody" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="hunterEdge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="hunterCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </radialGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Hooded silhouette (one continuous path) */}
          {/* Hood (drops over head and shoulders) */}
          <path
            d="M 100 4
               C 70 4, 60 18, 60 38
               L 60 56
               C 60 64, 64 72, 70 76
               L 60 86
               C 50 92, 40 100, 38 116
               L 32 142
               L 38 152
               L 50 156
               L 50 178
               L 56 182
               L 56 220
               L 64 230
               L 70 270
               L 72 320
               L 78 360
               L 82 380
               L 92 390
               L 100 390
               L 108 390
               L 118 380
               L 122 360
               L 128 320
               L 130 270
               L 136 230
               L 144 220
               L 144 182
               L 150 178
               L 150 156
               L 162 152
               L 168 142
               L 162 116
               C 160 100, 150 92, 140 86
               L 130 76
               C 136 72, 140 64, 140 56
               L 140 38
               C 140 18, 130 4, 100 4 Z"
            fill="url(#hunterBody)"
            stroke="url(#hunterEdge)"
            strokeWidth="1"
            opacity="0.95"
          />

          {/* Core glow (chest center) */}
          <ellipse cx="100" cy="130" rx="22" ry="32" fill="url(#hunterCore)" opacity="0.5" />

          {/* Hood inner shadow that obscures face */}
          <path
            d="M 78 30
               C 78 50, 88 64, 100 64
               C 112 64, 122 50, 122 30
               Z"
            fill="#020617"
          />

          {/* Eyes — two faint glow dots inside the hood */}
          <g>
            <circle cx="92" cy="44" r="1.6" fill="#60a5fa" opacity="0.9">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="108" cy="44" r="1.6" fill="#60a5fa" opacity="0.9">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Bicep highlights (visible during chest zoom) */}
          <path
            d="M 44 124 C 36 132, 38 152, 50 156"
            fill="none"
            stroke="#475569"
            strokeWidth="0.8"
            opacity="0.5"
          />
          <path
            d="M 156 124 C 164 132, 162 152, 150 156"
            fill="none"
            stroke="#475569"
            strokeWidth="0.8"
            opacity="0.5"
          />

          {/* Overlay anatomy per zoom state — switches based on the active region */}
          <AnimatePresence mode="wait">
            {zoom === "INT" && <BrainOverlay key="int" />}
            {zoom === "PER" && <EyeOverlay key="per" />}
            {zoom === "STR" && <MuscleOverlay key="str" />}
            {zoom === "VIT" && <HeartOverlay key="vit" />}
            {zoom === "AGI" && <LegsOverlay key="agi" />}
            {zoom === "full" && <PulseRing key="idle" />}
          </AnimatePresence>
        </motion.svg>

        {/* Bottom label */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950 to-transparent px-3 pb-3 pt-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400">
            Hunter Body
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {zoom === "full" ? (
              <span className="text-blue-300">IDLE</span>
            ) : (
              <span className={zoneTint(zoom)}>FOCUS · {zoneLabel(zoom)}</span>
            )}
          </span>
        </div>

        {/* Camera reticle when zoomed */}
        {zoom !== "full" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-blue-400/60" />
            <div className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-blue-400/60" />
            <div className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-blue-400/60" />
            <div className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-blue-400/60" />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function zoneLabel(z: ZoomTarget): string {
  return {
    full: "FULL",
    STR: "Chest",
    VIT: "Heart",
    AGI: "Legs",
    INT: "Brain",
    PER: "Eyes",
  }[z];
}

function zoneTint(z: ZoomTarget): string {
  return {
    full: "text-blue-300",
    STR: "text-rose-300",
    VIT: "text-emerald-300",
    AGI: "text-amber-300",
    INT: "text-blue-300",
    PER: "text-purple-300",
  }[z];
}

/* ============================================================
 * Idle: subtle pulse ring at chest core
 * ============================================================ */
function PulseRing() {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="100"
          cy="130"
          r="6"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="0.6"
          opacity="0.6"
        >
          <animate
            attributeName="r"
            values="6;26;6"
            dur="3.6s"
            begin={`${i * 1.2}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;0;0.6"
            dur="3.6s"
            begin={`${i * 1.2}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </motion.g>
  );
}

/* ============================================================
 * INT — Brain with synapse network firing
 * ============================================================ */
function BrainOverlay() {
  // Synapse nodes inside the head region (centered around 100,40)
  const nodes: [number, number][] = [
    [88, 26], [100, 22], [112, 26],
    [82, 38], [94, 38], [106, 38], [118, 38],
    [86, 50], [100, 52], [114, 50],
    [92, 60], [108, 60],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 6], [3, 4], [4, 5], [5, 6],
    [3, 7], [4, 8], [5, 8], [6, 9], [7, 10], [8, 10], [8, 11], [9, 11],
  ];

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Brain outline */}
      <path
        d="M 78 28
           C 78 18, 92 12, 100 18
           C 108 12, 122 18, 122 28
           C 128 30, 128 42, 122 46
           C 124 56, 116 64, 108 62
           C 104 66, 96 66, 92 62
           C 84 64, 76 56, 78 46
           C 72 42, 72 30, 78 28 Z"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="0.6"
        opacity="0.7"
        filter="url(#glow)"
      />
      {/* Hemispheric divide */}
      <path
        d="M 100 18 Q 96 36, 100 62"
        stroke="#3b82f6"
        strokeWidth="0.5"
        fill="none"
        opacity="0.6"
      />
      {/* Synapse edges */}
      {edges.map(([a, b], i) => {
        const A = nodes[a]!;
        const B = nodes[b]!;
        return (
          <line
            key={i}
            x1={A[0]}
            y1={A[1]}
            x2={B[0]}
            y2={B[1]}
            stroke="#60a5fa"
            strokeWidth="0.5"
            opacity="0.4"
          >
            <animate
              attributeName="opacity"
              values="0.2;0.9;0.2"
              dur={`${1.2 + (i % 4) * 0.3}s`}
              begin={`${(i % 5) * 0.18}s`}
              repeatCount="indefinite"
            />
          </line>
        );
      })}
      {/* Synapse nodes pulsing */}
      {nodes.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="1.2"
          fill="#dbeafe"
          filter="url(#glow)"
        >
          <animate
            attributeName="r"
            values="1.2;2.2;1.2"
            dur={`${1.4 + (i % 3) * 0.3}s`}
            begin={`${(i % 6) * 0.15}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      {/* Spark traveling along an edge */}
      <circle r="1.4" fill="#fff" filter="url(#glow)">
        <animateMotion
          path="M 88 26 L 94 38 L 100 52 L 108 60 L 114 50 L 106 38 L 100 22 L 88 26"
          dur="3.2s"
          repeatCount="indefinite"
        />
      </circle>
    </motion.g>
  );
}

/* ============================================================
 * PER — Eye with iris radar
 * ============================================================ */
function EyeOverlay() {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Eye almond shape (right eye position roughly 92, 44; left 108, 44) */}
      {[92, 108].map((cx, idx) => (
        <g key={cx}>
          {/* Sclera */}
          <ellipse cx={cx} cy="44" rx="6" ry="3.5" fill="#0f172a" stroke="#c084fc" strokeWidth="0.4" />
          {/* Iris ring */}
          <circle
            cx={cx}
            cy="44"
            r="2.6"
            fill="#1e1b4b"
            stroke="#a855f7"
            strokeWidth="0.4"
          >
            <animate
              attributeName="r"
              values="2.6;3.2;2.6"
              dur="3s"
              begin={`${idx * 0.4}s`}
              repeatCount="indefinite"
            />
          </circle>
          {/* Pupil */}
          <circle cx={cx} cy="44" r="1.2" fill="#020617">
            <animate
              attributeName="r"
              values="1.2;0.7;1.2"
              dur="3s"
              begin={`${idx * 0.4}s`}
              repeatCount="indefinite"
            />
          </circle>
          {/* Highlight */}
          <circle cx={cx - 0.6} cy="43.4" r="0.4" fill="#fff" opacity="0.8" />
        </g>
      ))}
      {/* Crosshair scan lines */}
      <g stroke="#c084fc" strokeWidth="0.3" opacity="0.4">
        <line x1="74" y1="44" x2="126" y2="44" />
        <line x1="100" y1="34" x2="100" y2="54" />
      </g>
      {/* Sweeping arc */}
      <g style={{ transformOrigin: "100px 44px" }}>
        <line x1="100" y1="44" x2="116" y2="44" stroke="#d8b4fe" strokeWidth="0.4" opacity="0.6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 100 44"
            to="360 100 44"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </line>
      </g>
    </motion.g>
  );
}

/* ============================================================
 * STR — Bicep muscle fibers flexing
 * ============================================================ */
function MuscleOverlay() {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Left bicep cluster */}
      <g transform="translate(48, 122)">
        <ellipse cx="0" cy="14" rx="14" ry="20" fill="#7f1d1d" opacity="0.35" stroke="#fb7185" strokeWidth="0.5">
          <animate
            attributeName="ry"
            values="20;23;20"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </ellipse>
        {/* Fibers */}
        {[-8, -4, 0, 4, 8].map((dx, i) => (
          <line
            key={i}
            x1={dx}
            y1="-4"
            x2={dx}
            y2="32"
            stroke="#fda4af"
            strokeWidth="0.6"
            opacity="0.7"
          >
            <animate
              attributeName="opacity"
              values="0.4;0.9;0.4"
              dur="1.4s"
              begin={`${i * 0.08}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </g>
      {/* Right bicep cluster */}
      <g transform="translate(152, 122)">
        <ellipse cx="0" cy="14" rx="14" ry="20" fill="#7f1d1d" opacity="0.35" stroke="#fb7185" strokeWidth="0.5">
          <animate
            attributeName="ry"
            values="20;23;20"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </ellipse>
        {[-8, -4, 0, 4, 8].map((dx, i) => (
          <line
            key={i}
            x1={dx}
            y1="-4"
            x2={dx}
            y2="32"
            stroke="#fda4af"
            strokeWidth="0.6"
            opacity="0.7"
          >
            <animate
              attributeName="opacity"
              values="0.4;0.9;0.4"
              dur="1.4s"
              begin={`${i * 0.08 + 0.2}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </g>
      {/* Chest pec lines */}
      <g stroke="#fb7185" strokeWidth="0.5" fill="none" opacity="0.6" filter="url(#glow)">
        <path d="M 70 100 Q 80 110, 96 110 L 96 130">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.4s" repeatCount="indefinite" />
        </path>
        <path d="M 130 100 Q 120 110, 104 110 L 104 130">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Impact starburst */}
      <g stroke="#fda4af" strokeWidth="0.6" opacity="0.5">
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x1 = 100 + Math.cos(angle) * 18;
          const y1 = 130 + Math.sin(angle) * 18;
          const x2 = 100 + Math.cos(angle) * 32;
          const y2 = 130 + Math.sin(angle) * 32;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
              <animate
                attributeName="opacity"
                values="0.2;0.9;0.2"
                dur="1.4s"
                begin={`${i * 0.05}s`}
                repeatCount="indefinite"
              />
            </line>
          );
        })}
      </g>
    </motion.g>
  );
}

/* ============================================================
 * VIT — Heart with vessels
 * ============================================================ */
function HeartOverlay() {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <g style={{ transformOrigin: "100px 130px" }}>
        <g>
          {/* Anatomical heart */}
          <path
            d="M 100 152
               C 88 144, 76 134, 76 122
               C 76 114, 84 110, 90 114
               C 94 116, 97 120, 100 124
               C 103 120, 106 116, 110 114
               C 116 110, 124 114, 124 122
               C 124 134, 112 144, 100 152 Z"
            fill="#7f1d1d"
            stroke="#34d399"
            strokeWidth="0.6"
            opacity="0.85"
            filter="url(#glow)"
          >
            <animateTransform
              attributeName="transform"
              type="scale"
              additive="sum"
              values="1;1.12;1"
              dur="0.9s"
              repeatCount="indefinite"
            />
          </path>
        </g>
        {/* Vessels traveling outward */}
        <g stroke="#34d399" strokeWidth="0.5" fill="none">
          <path d="M 92 116 Q 84 108, 78 102" opacity="0.7">
            <animate attributeName="stroke-dasharray" values="0 30;30 0" dur="1.8s" repeatCount="indefinite" />
          </path>
          <path d="M 108 116 Q 116 108, 122 102" opacity="0.7">
            <animate attributeName="stroke-dasharray" values="0 30;30 0" dur="1.8s" repeatCount="indefinite" />
          </path>
        </g>
        {/* Blood pulse traveling */}
        <circle r="1.6" fill="#fca5a5" filter="url(#glow)">
          <animateMotion
            path="M 100 152 L 100 140 L 96 132 L 100 124 L 104 132 L 100 140 L 100 152"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Halo ring */}
        <circle cx="100" cy="130" r="22" fill="none" stroke="#10b981" strokeWidth="0.4" opacity="0.3">
          <animate attributeName="r" values="18;28;18" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </g>
    </motion.g>
  );
}

/* ============================================================
 * AGI — Legs with kinetic motion lines
 * ============================================================ */
function LegsOverlay() {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Left leg with stride animation */}
      <g style={{ transformOrigin: "85px 240px" }}>
        <motion.g
          animate={{ rotate: [0, 6, 0, -6, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Quad */}
          <path
            d="M 78 230 Q 76 270, 80 310 L 92 310 Q 94 270, 88 230 Z"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="0.6"
            opacity="0.7"
          />
          {/* Knee joint */}
          <circle cx="84" cy="290" r="2" fill="#fde68a" opacity="0.9" />
          {/* Shin */}
          <path
            d="M 82 290 Q 80 320, 80 350 L 92 350 Q 90 320, 86 290 Z"
            fill="none"
            stroke="#fcd34d"
            strokeWidth="0.5"
            opacity="0.6"
          />
        </motion.g>
      </g>
      {/* Right leg with stride animation (opposite phase) */}
      <g style={{ transformOrigin: "115px 240px" }}>
        <motion.g
          animate={{ rotate: [0, -6, 0, 6, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
        >
          <path
            d="M 112 230 Q 114 270, 120 310 L 108 310 Q 106 270, 102 230 Z"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="0.6"
            opacity="0.7"
          />
          <circle cx="116" cy="290" r="2" fill="#fde68a" opacity="0.9" />
          <path
            d="M 118 290 Q 120 320, 120 350 L 108 350 Q 110 320, 114 290 Z"
            fill="none"
            stroke="#fcd34d"
            strokeWidth="0.5"
            opacity="0.6"
          />
        </motion.g>
      </g>
      {/* Kinetic motion lines */}
      <g stroke="#fbbf24" strokeLinecap="round" strokeWidth="0.8" opacity="0.65">
        {[
          [60, 250, 72, 250],
          [56, 270, 70, 270],
          [60, 290, 72, 290],
          [140, 250, 128, 250],
          [144, 270, 130, 270],
          [140, 290, 128, 290],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
            <animate
              attributeName="opacity"
              values="0.2;0.9;0.2"
              dur="0.7s"
              begin={`${i * 0.08}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </g>
      {/* Ground impact ripples */}
      <g fill="none" stroke="#fcd34d" strokeWidth="0.5">
        <ellipse cx="86" cy="358" rx="4" ry="1.2" opacity="0.6">
          <animate attributeName="rx" values="4;16;4" dur="0.7s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="0.7s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="114" cy="358" rx="4" ry="1.2" opacity="0.6">
          <animate attributeName="rx" values="4;16;4" dur="0.7s" begin="0.35s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="0.7s" begin="0.35s" repeatCount="indefinite" />
        </ellipse>
      </g>
    </motion.g>
  );
}
