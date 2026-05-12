"use client";

import { motion, AnimatePresence } from "motion/react";
import type { StatKind } from "@/lib/types";

/**
 * <HunterFigure /> — central HUD console.
 *
 * A clean technical "System scan" display. The body is drawn as a minimal
 * iconographic anatomy diagram (no attempt at realism — pure constructivist
 * lines/arcs). The composition is framed inside a Solo Leveling-style HUD
 * window with corner brackets, scan lines, data readouts, and a top stat
 * dial.
 *
 * When a stat is focused, the camera "zooms" via SVG viewBox spring and a
 * stat-specific overlay activates on the corresponding body region:
 *
 *   STR → chest        VIT → heart        AGI → legs
 *   INT → brain        PER → eyes
 */

export type ZoomTarget = "full" | StatKind;

const STAT_TINT: Record<StatKind, string> = {
  STR: "rgba(244,63,94,0.55)",
  VIT: "rgba(16,185,129,0.55)",
  AGI: "rgba(245,158,11,0.6)",
  INT: "rgba(59,130,246,0.55)",
  PER: "rgba(168,85,247,0.55)",
};

const STAT_HEX: Record<StatKind, string> = {
  STR: "#fb7185",
  VIT: "#34d399",
  AGI: "#fbbf24",
  INT: "#60a5fa",
  PER: "#c084fc",
};

const VIEWBOX = {
  full: { x: 0, y: 0, w: 200, h: 400 },
  INT: { x: 60, y: 0, w: 80, h: 80 },
  PER: { x: 75, y: 28, w: 50, h: 30 },
  STR: { x: 40, y: 80, w: 120, h: 90 },
  VIT: { x: 70, y: 100, w: 60, h: 60 },
  AGI: { x: 50, y: 220, w: 100, h: 150 },
} as const;

const LABEL: Record<ZoomTarget, string> = {
  full: "FULL SCAN",
  STR: "PECTORALIS · STR",
  VIT: "CARDIAC · VIT",
  AGI: "QUADRICEPS · AGI",
  INT: "CEREBRUM · INT",
  PER: "OCULAR · PER",
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
  const tint = zoom === "full" ? "rgba(59,130,246,0.35)" : STAT_TINT[zoom];
  const accent = zoom === "full" ? "#60a5fa" : STAT_HEX[zoom];

  return (
    <div className={`relative ${className}`}>
      {/* Faint glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[40px] blur-3xl opacity-60"
        initial={false}
        animate={{ backgroundColor: tint }}
        transition={{ duration: 0.8 }}
      />

      {/* Console frame */}
      <div className="relative rounded-[28px] border border-white/10 bg-gradient-to-b from-slate-900/40 to-slate-950/80 p-5 backdrop-blur-xl">
        {/* Top corner brackets */}
        <Bracket pos="tl" />
        <Bracket pos="tr" />
        <Bracket pos="bl" />
        <Bracket pos="br" />

        {/* Header strip */}
        <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.3em] uppercase">
          <div className="flex items-center gap-2 text-slate-400">
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span style={{ color: accent }}>● SCAN</span>
            <span className="text-slate-600">·</span>
            <span>v0.1</span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            {String(new Date().getHours()).padStart(2, "0")}:{String(new Date().getMinutes()).padStart(2, "0")}
          </div>
        </div>

        {/* Top divider */}
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {/* Viewport */}
        <div className="relative aspect-[5/7] w-full overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_30%,rgba(15,23,42,0.5),rgba(2,6,23,0.95))]">
          {/* Cross-hatch background grid */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          {/* Center crosshair */}
          <div aria-hidden className="absolute inset-0">
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/5 -translate-x-1/2" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-white/5 -translate-y-1/2" />
          </div>

          {/* Subtle scan line sweep */}
          <motion.div
            aria-hidden
            className="absolute inset-x-0 h-12 pointer-events-none"
            style={{
              background: `linear-gradient(180deg, transparent 0%, ${accent}33 50%, transparent 100%)`,
            }}
            animate={{ y: ["-20%", "120%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />

          {/* The SVG body */}
          <motion.svg
            viewBox={viewBoxStr}
            initial={false}
            animate={{ viewBox: viewBoxStr } as any}
            transition={{ type: "spring", stiffness: 90, damping: 22, mass: 1.2 }}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
          >
            <BodyDiagram zoom={zoom} accent={accent} />

            <AnimatePresence mode="wait">
              {zoom === "INT" && <BrainOverlay key="int" accent={accent} />}
              {zoom === "PER" && <EyeOverlay key="per" accent={accent} />}
              {zoom === "STR" && <MuscleOverlay key="str" accent={accent} />}
              {zoom === "VIT" && <HeartOverlay key="vit" accent={accent} />}
              {zoom === "AGI" && <LegsOverlay key="agi" accent={accent} />}
              {zoom === "full" && <IdleOverlay key="idle" accent={accent} />}
            </AnimatePresence>
          </motion.svg>

          {/* Reticle when zoomed */}
          {zoom !== "full" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0"
            >
              <Reticle pos="tl" accent={accent} />
              <Reticle pos="tr" accent={accent} />
              <Reticle pos="bl" accent={accent} />
              <Reticle pos="br" accent={accent} />
            </motion.div>
          )}

          {/* Bottom data bar */}
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-slate-400">
              SUBJ · HUNTER
            </span>
            <motion.span
              key={zoom}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-[10px] tracking-[0.25em] uppercase"
              style={{ color: accent }}
            >
              {LABEL[zoom]}
            </motion.span>
          </div>
        </div>

        {/* Bottom readout strip */}
        <div className="mt-3 flex items-center justify-between text-[9px] font-mono tracking-[0.3em] uppercase">
          <span className="text-slate-500">SIGNAL</span>
          <SignalBars accent={accent} />
          <span className="text-slate-500">LOCK</span>
          <span style={{ color: accent }}>{zoom === "full" ? "WIDE" : "FOCUS"}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Console chrome — brackets, reticles, signal bars
 * ============================================================ */

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const pmap = {
    tl: "left-2 top-2 border-l-2 border-t-2",
    tr: "right-2 top-2 border-r-2 border-t-2",
    bl: "left-2 bottom-2 border-l-2 border-b-2",
    br: "right-2 bottom-2 border-r-2 border-b-2",
  };
  return <div className={`pointer-events-none absolute ${pmap[pos]} h-3 w-3 border-white/15 rounded-[2px]`} />;
}

function Reticle({ pos, accent }: { pos: "tl" | "tr" | "bl" | "br"; accent: string }) {
  const pmap = {
    tl: "left-3 top-3 border-l-2 border-t-2",
    tr: "right-3 top-3 border-r-2 border-t-2",
    bl: "left-3 bottom-3 border-l-2 border-b-2",
    br: "right-3 bottom-3 border-r-2 border-b-2",
  };
  return <div className={`absolute ${pmap[pos]} h-4 w-4`} style={{ borderColor: accent }} />;
}

function SignalBars({ accent }: { accent: string }) {
  return (
    <div className="flex items-end gap-0.5">
      {[2, 4, 6, 8, 10].map((h, i) => (
        <motion.span
          key={i}
          className="block w-0.5 rounded-sm"
          style={{ height: h, backgroundColor: accent }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, delay: i * 0.12, repeat: Infinity }}
        />
      ))}
    </div>
  );
}

/* ============================================================
 * Body diagram — clean iconographic anatomy
 *   The figure is built from arcs + lines, frontal pose, ~Vitruvian
 *   proportions but stylized for icon clarity. Total canvas 200x400.
 * ============================================================ */

function BodyDiagram({ zoom, accent }: { zoom: ZoomTarget; accent: string }) {
  const dim = zoom === "full" ? 1 : 0.35;
  return (
    <g opacity={dim < 1 ? dim : 1}>
      <defs>
        <linearGradient id="bodyStroke" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#475569" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Background body silhouette — soft ghost shape */}
      <path
        d="M 100 18
           C 86 18, 80 30, 80 42
           C 80 50, 84 56, 90 60
           L 90 70
           L 70 78
           C 60 84, 58 100, 60 116
           L 64 156
           C 64 162, 66 168, 70 172
           L 80 180
           L 82 220
           L 78 290
           L 82 360
           L 90 388
           L 100 388
           L 110 388
           L 118 360
           L 122 290
           L 118 220
           L 120 180
           L 130 172
           C 134 168, 136 162, 136 156
           L 140 116
           C 142 100, 140 84, 130 78
           L 110 70
           L 110 60
           C 116 56, 120 50, 120 42
           C 120 30, 114 18, 100 18 Z"
        fill="#0b1220"
        opacity="0.7"
      />

      {/* Anatomical wireframe */}
      <g fill="none" stroke="url(#bodyStroke)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <ellipse cx="100" cy="40" rx="18" ry="22" />
        {/* Neck */}
        <line x1="92" y1="62" x2="92" y2="72" />
        <line x1="108" y1="62" x2="108" y2="72" />
        {/* Shoulders */}
        <path d="M 70 78 Q 100 70, 130 78" />
        {/* Sternum line */}
        <line x1="100" y1="80" x2="100" y2="170" strokeDasharray="2 2" opacity="0.5" />
        {/* Pectoral arches */}
        <path d="M 78 90 Q 90 110, 100 110 Q 110 110, 122 90" />
        {/* Abdominal segments */}
        <line x1="86" y1="120" x2="114" y2="120" strokeDasharray="1 2" opacity="0.4" />
        <line x1="86" y1="135" x2="114" y2="135" strokeDasharray="1 2" opacity="0.4" />
        <line x1="86" y1="150" x2="114" y2="150" strokeDasharray="1 2" opacity="0.4" />
        {/* Waist */}
        <path d="M 78 168 Q 100 175, 122 168" />
        {/* Hips */}
        <path d="M 76 188 Q 100 200, 124 188" />
        {/* Arms (held at sides, slight outward) */}
        <path d="M 70 80 Q 56 130, 60 170 Q 62 178, 64 178" />
        <path d="M 130 80 Q 144 130, 140 170 Q 138 178, 136 178" />
        {/* Pelvis pubic V */}
        <path d="M 88 200 L 100 218 L 112 200" />
        {/* Left leg outline */}
        <path d="M 84 210 Q 78 260, 80 310 Q 82 350, 86 384" />
        <path d="M 100 218 Q 96 260, 96 310 Q 96 350, 96 388" />
        {/* Right leg outline */}
        <path d="M 116 210 Q 122 260, 120 310 Q 118 350, 114 384" />
        <path d="M 100 218 Q 104 260, 104 310 Q 104 350, 104 388" strokeDasharray="0" />
        {/* Knee dots */}
        <circle cx="88" cy="280" r="1.5" fill="url(#bodyStroke)" />
        <circle cx="112" cy="280" r="1.5" fill="url(#bodyStroke)" />
      </g>

      {/* Anatomical landmark dots */}
      <g fill={accent} opacity="0.7">
        <circle cx="100" cy="40" r="0.8" />
        <circle cx="100" cy="100" r="0.8" />
        <circle cx="100" cy="130" r="0.8" />
        <circle cx="100" cy="180" r="0.8" />
        <circle cx="88" cy="280" r="0.8" />
        <circle cx="112" cy="280" r="0.8" />
      </g>

      {/* Center energy node */}
      <g>
        <circle cx="100" cy="130" r="3.5" fill={accent} opacity="0.4" />
        <circle cx="100" cy="130" r="1.5" fill={accent} />
      </g>
    </g>
  );
}

/* ============================================================
 * Idle: data orbits around chest core
 * ============================================================ */
function IdleOverlay({ accent }: { accent: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[14, 22, 32].map((r, i) => (
        <circle
          key={i}
          cx="100"
          cy="130"
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth="0.4"
          opacity={0.3 - i * 0.06}
        >
          <animate
            attributeName="r"
            values={`${r};${r + 6};${r}`}
            dur={`${4 + i * 0.6}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values={`${0.5 - i * 0.06};0;${0.5 - i * 0.06}`}
            dur={`${4 + i * 0.6}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      {/* Orbiting dot */}
      <g style={{ transformOrigin: "100px 130px" }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 100 130"
          to="360 100 130"
          dur="10s"
          repeatCount="indefinite"
        />
        <circle cx="130" cy="130" r="1.4" fill={accent} />
      </g>
    </motion.g>
  );
}

/* ============================================================
 * INT — Brain
 * ============================================================ */
function BrainOverlay({ accent }: { accent: string }) {
  const nodes: [number, number][] = [
    [92, 28], [100, 24], [108, 28],
    [86, 36], [96, 38], [104, 38], [114, 36],
    [88, 46], [100, 50], [112, 46],
    [94, 56], [106, 56],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 6], [3, 4], [4, 5], [5, 6],
    [3, 7], [4, 8], [5, 8], [6, 9], [7, 10], [8, 10], [8, 11], [9, 11],
  ];
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      {/* Brain outline */}
      <path
        d="M 82 30 C 82 22, 92 18, 100 22 C 108 18, 118 22, 118 30 C 122 32, 122 42, 118 46 C 120 54, 114 60, 108 58 C 104 62, 96 62, 92 58 C 86 60, 80 54, 82 46 C 78 42, 78 32, 82 30 Z"
        fill="none"
        stroke={accent}
        strokeWidth="0.5"
        opacity="0.8"
      />
      <path d="M 100 22 Q 96 38, 100 58" stroke={accent} strokeWidth="0.4" fill="none" opacity="0.5" />
      {edges.map(([a, b], i) => {
        const A = nodes[a]!;
        const B = nodes[b]!;
        return (
          <line key={i} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={accent} strokeWidth="0.4" opacity="0.5">
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur={`${1.2 + (i % 4) * 0.3}s`} begin={`${(i % 5) * 0.15}s`} repeatCount="indefinite" />
          </line>
        );
      })}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill={accent}>
          <animate attributeName="r" values="1;1.8;1" dur={`${1.4 + (i % 3) * 0.3}s`} begin={`${(i % 6) * 0.15}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <circle r="1.2" fill="#fff">
        <animateMotion path="M 92 28 L 96 38 L 100 50 L 106 56 L 112 46 L 104 38 L 100 24 L 92 28" dur="3.2s" repeatCount="indefinite" />
      </circle>
    </motion.g>
  );
}

/* ============================================================
 * PER — Eyes
 * ============================================================ */
function EyeOverlay({ accent }: { accent: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      {[92, 108].map((cx, idx) => (
        <g key={cx}>
          <ellipse cx={cx} cy="40" rx="5" ry="3" fill="#020617" stroke={accent} strokeWidth="0.4" />
          <circle cx={cx} cy="40" r="2.2" fill="#1e1b4b" stroke={accent} strokeWidth="0.35">
            <animate attributeName="r" values="2.2;2.6;2.2" dur="3s" begin={`${idx * 0.4}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={cx} cy="40" r="1" fill="#020617">
            <animate attributeName="r" values="1;0.6;1" dur="3s" begin={`${idx * 0.4}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={cx - 0.5} cy="39.5" r="0.3" fill="#fff" opacity="0.8" />
        </g>
      ))}
      <g stroke={accent} strokeWidth="0.25" opacity="0.4">
        <line x1="78" y1="40" x2="122" y2="40" />
        <line x1="100" y1="32" x2="100" y2="48" />
      </g>
    </motion.g>
  );
}

/* ============================================================
 * STR — Muscles
 * ============================================================ */
function MuscleOverlay({ accent }: { accent: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      {/* Pec lines glowing */}
      <g stroke={accent} strokeWidth="0.6" fill="none">
        <path d="M 78 90 Q 90 110, 100 110">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
        </path>
        <path d="M 122 90 Q 110 110, 100 110">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Bicep arcs */}
      <g stroke={accent} strokeWidth="0.5" fill="none">
        <path d="M 56 110 Q 50 130, 56 150">
          <animate attributeName="d" values="M 56 110 Q 50 130, 56 150;M 58 110 Q 48 130, 58 150;M 56 110 Q 50 130, 56 150" dur="1.4s" repeatCount="indefinite" />
        </path>
        <path d="M 144 110 Q 150 130, 144 150">
          <animate attributeName="d" values="M 144 110 Q 150 130, 144 150;M 142 110 Q 152 130, 142 150;M 144 110 Q 150 130, 144 150" dur="1.4s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Center burst */}
      <g stroke={accent} strokeWidth="0.4" opacity="0.6">
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * 45 * Math.PI) / 180;
          const x1 = 100 + Math.cos(a) * 14;
          const y1 = 130 + Math.sin(a) * 14;
          const x2 = 100 + Math.cos(a) * 24;
          const y2 = 130 + Math.sin(a) * 24;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
              <animate attributeName="opacity" values="0.2;0.9;0.2" dur="1.4s" begin={`${i * 0.05}s`} repeatCount="indefinite" />
            </line>
          );
        })}
      </g>
      {/* Central pulse */}
      <circle cx="100" cy="130" r="4" fill={accent} opacity="0.6">
        <animate attributeName="r" values="4;7;4" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </motion.g>
  );
}

/* ============================================================
 * VIT — Heart
 * ============================================================ */
function HeartOverlay({ accent }: { accent: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <g style={{ transformOrigin: "100px 130px" }}>
        <path
          d="M 100 148 C 90 142, 80 134, 80 124 C 80 118, 86 114, 91 118 C 94 120, 97 123, 100 127 C 103 123, 106 120, 109 118 C 114 114, 120 118, 120 124 C 120 134, 110 142, 100 148 Z"
          fill={accent}
          opacity="0.7"
          stroke={accent}
          strokeWidth="0.4"
        >
          <animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.12;1" dur="0.9s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Vessels */}
      <g stroke={accent} strokeWidth="0.4" fill="none" opacity="0.6">
        <path d="M 91 118 Q 84 110, 78 104">
          <animate attributeName="stroke-dasharray" values="0 30;30 0" dur="1.8s" repeatCount="indefinite" />
        </path>
        <path d="M 109 118 Q 116 110, 122 104">
          <animate attributeName="stroke-dasharray" values="0 30;30 0" dur="1.8s" repeatCount="indefinite" />
        </path>
      </g>
      <circle r="1.4" fill="#fca5a5">
        <animateMotion path="M 100 148 L 100 138 L 96 130 L 100 124 L 104 130 L 100 138 L 100 148" dur="0.9s" repeatCount="indefinite" />
      </circle>
    </motion.g>
  );
}

/* ============================================================
 * AGI — Legs
 * ============================================================ */
function LegsOverlay({ accent }: { accent: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      {/* Quad highlights */}
      <g stroke={accent} strokeWidth="0.5" fill="none">
        <path d="M 84 230 Q 80 260, 88 280" opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.6s" repeatCount="indefinite" />
        </path>
        <path d="M 116 230 Q 120 260, 112 280" opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.6s" begin="0.3s" repeatCount="indefinite" />
        </path>
        {/* Shin highlights */}
        <path d="M 86 290 Q 84 330, 88 360" opacity="0.7">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.6s" begin="0.15s" repeatCount="indefinite" />
        </path>
        <path d="M 114 290 Q 116 330, 112 360" opacity="0.7">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.6s" begin="0.45s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Joints */}
      <circle cx="88" cy="280" r="2" fill={accent}>
        <animate attributeName="r" values="2;3;2" dur="0.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="112" cy="280" r="2" fill={accent}>
        <animate attributeName="r" values="2;3;2" dur="0.6s" begin="0.3s" repeatCount="indefinite" />
      </circle>
      {/* Speed lines */}
      <g stroke={accent} strokeLinecap="round" strokeWidth="0.6" opacity="0.6">
        {[[58, 250, 70, 250], [54, 270, 68, 270], [58, 290, 70, 290], [60, 320, 72, 320], [142, 250, 130, 250], [146, 270, 132, 270], [142, 290, 130, 290], [140, 320, 128, 320]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur="0.7s" begin={`${i * 0.06}s`} repeatCount="indefinite" />
          </line>
        ))}
      </g>
      {/* Ground impact */}
      <g fill="none" stroke={accent} strokeWidth="0.4">
        <ellipse cx="90" cy="372" rx="6" ry="1">
          <animate attributeName="rx" values="6;18;6" dur="0.7s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="0.7s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="110" cy="372" rx="6" ry="1">
          <animate attributeName="rx" values="6;18;6" dur="0.7s" begin="0.35s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="0.7s" begin="0.35s" repeatCount="indefinite" />
        </ellipse>
      </g>
    </motion.g>
  );
}
