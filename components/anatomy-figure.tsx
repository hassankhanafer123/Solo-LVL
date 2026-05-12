"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { StatKind } from "@/lib/types";

export type AnatomyFocus = "idle" | StatKind;

/**
 * A clean front-facing anatomical illustration drawn in SVG. Not a stick
 * figure, not a wireframe skeleton — a proper medical-illustration-style
 * outlined body with visible internal anatomy (skull/brain, spine, ribcage,
 * heart). Each region is highlightable by stat. The camera "zoom" is faked
 * by smoothly animating the SVG's scale + translate.
 */

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

const STAT_GLOW: Record<StatKind, string> = {
  INT: "rgba(96,165,250,0.55)",
  STR: "rgba(251,113,133,0.55)",
  DIS: "rgba(192,132,252,0.55)",
};

// SVG viewBox is 0 0 400 800. "Camera" transforms target this box.
const CAMERA: Record<AnatomyFocus, { scale: number; tx: number; ty: number }> = {
  idle: { scale: 1, tx: 0, ty: 0 },        // wide
  INT:  { scale: 2.8, tx: 0, ty: 160 },    // zoom into head (top of figure)
  STR:  { scale: 1.7, tx: 0, ty: -10 },    // mid-body
  DIS:  { scale: 1.45, tx: -10, ty: -5 },  // slight angle on torso/spine
};

export function AnatomyFigure({ focus }: { focus: AnatomyFocus }) {
  const reduce = useReducedMotion();
  const cam = CAMERA[focus];

  // Per-region active state
  const active = (region: "head" | "spine" | "ribcage" | "arms" | "legs"): StatKind | null => {
    if (focus === "idle") return null;
    if (focus === "INT" && region === "head") return "INT";
    if (focus === "STR" && (region === "ribcage" || region === "arms" || region === "legs")) return "STR";
    if (focus === "DIS" && (region === "spine" || region === "head")) return "DIS";
    return null;
  };

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center"
    >
      <motion.svg
        viewBox="0 0 400 800"
        className="h-[92vh] w-auto"
        initial={false}
        animate={reduce ? undefined : { scale: cam.scale, x: cam.tx, y: cam.ty }}
        transition={{ type: "spring", stiffness: 60, damping: 22, mass: 1.2 }}
        style={{ willChange: "transform" }}
      >
        <defs>
          {/* Body silhouette gradient */}
          <linearGradient id="body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.25" />
          </linearGradient>

          {/* Stat glow filters */}
          {(Object.keys(STAT_HEX) as StatKind[]).map((s) => (
            <filter key={s} id={`glow-${s}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* ============================================================
            Body silhouette — front-facing humanoid outline.
            Drawn as one continuous path with smooth curves.
            ============================================================ */}
        <Body active={active("head") || active("ribcage") || active("legs")} />

        {/* ============================================================
            Internal anatomy — visible inside the body
            ============================================================ */}

        {/* Skull + brain (head region) */}
        <Head active={active("head")} />

        {/* Spine — vertical column of vertebrae */}
        <Spine active={active("spine")} />

        {/* Ribcage — pairs of arcs */}
        <Ribcage active={active("ribcage")} />

        {/* Heart suggestion (left of center, decorative) */}
        <Heart active={active("ribcage")} />

        {/* Arms anatomy */}
        <Arms active={active("arms")} />

        {/* Legs anatomy */}
        <Legs active={active("legs")} />

        {/* Pelvis */}
        <Pelvis active={active("legs") || active("spine")} />
      </motion.svg>
    </motion.div>
  );
}

/* ---------- Body silhouette ---------- */
function Body({ active }: { active: StatKind | null }) {
  const stroke = active ? STAT_HEX[active] : "#94a3b8";
  return (
    <g opacity={0.95}>
      <path
        d="
          M 200 50
          C 175 50, 158 70, 158 95
          C 158 110, 162 122, 170 130
          L 168 142
          C 158 148, 152 158, 152 168
          L 130 192
          C 118 200, 110 218, 108 240
          L 102 290
          L 98 320
          L 100 340
          L 110 348
          L 110 360
          C 110 370, 112 380, 116 388
          L 122 410
          L 120 440
          L 122 480
          L 130 530
          L 138 580
          L 144 640
          L 152 700
          L 158 740
          L 168 770
          L 178 780
          L 188 780
          L 198 780
          L 200 690
          L 202 780
          L 212 780
          L 222 780
          L 232 770
          L 242 740
          L 248 700
          L 256 640
          L 262 580
          L 270 530
          L 278 480
          L 280 440
          L 278 410
          L 284 388
          C 288 380, 290 370, 290 360
          L 290 348
          L 300 340
          L 302 320
          L 298 290
          L 292 240
          C 290 218, 282 200, 270 192
          L 248 168
          C 248 158, 242 148, 232 142
          L 230 130
          C 238 122, 242 110, 242 95
          C 242 70, 225 50, 200 50 Z
        "
        fill="url(#body-grad)"
        stroke={stroke}
        strokeWidth="1.2"
        opacity="0.9"
      />
    </g>
  );
}

/* ---------- Head & brain ---------- */
function Head({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  const fillOp = active ? 0.5 : 0;
  return (
    <g filter={active ? `url(#glow-${active})` : undefined}>
      {/* Skull (inside head silhouette) */}
      <ellipse
        cx="200"
        cy="93"
        rx="38"
        ry="44"
        fill={active ? STAT_GLOW[active!] : "transparent"}
        stroke={color}
        strokeWidth="1"
        opacity={active ? 0.9 : 0.6}
      />

      {/* Brain — two hemispheres with gyri lines */}
      <g stroke={color} strokeWidth="0.9" fill="none" opacity={active ? 1 : 0.6}>
        <path d="M 180 78 C 178 70, 188 64, 196 68 C 200 66, 204 66, 206 68 C 214 64, 224 70, 222 78 C 226 80, 226 90, 222 92 C 224 100, 218 106, 212 104 C 208 108, 204 108, 200 106 C 196 108, 192 108, 188 104 C 182 106, 176 100, 178 92 C 174 90, 174 80, 180 78 Z" />
        <path d="M 200 68 Q 197 88, 200 106" />
        <path d="M 188 80 Q 186 86, 192 92" />
        <path d="M 212 80 Q 214 86, 208 92" />
        <path d="M 186 96 Q 192 100, 198 96" />
        <path d="M 214 96 Q 208 100, 202 96" />
      </g>

      {/* Eyes — subtle, closed/meditative */}
      <g stroke={active ? color : "#475569"} strokeWidth="1" fill="none" opacity="0.85">
        <path d="M 184 115 Q 188 117, 192 115" />
        <path d="M 208 115 Q 212 117, 216 115" />
      </g>

      {/* Nose hint */}
      <path d="M 200 122 L 200 132 L 196 134" stroke={active ? color : "#64748b"} strokeWidth="0.8" fill="none" opacity="0.6" />

      {/* Mouth */}
      <path d="M 192 140 Q 200 142, 208 140" stroke={active ? color : "#64748b"} strokeWidth="0.8" fill="none" opacity="0.6" />

      {/* If active, add interior glow */}
      {active && (
        <ellipse cx="200" cy="93" rx="30" ry="35" fill={STAT_GLOW[active]} opacity={fillOp} />
      )}
    </g>
  );
}

/* ---------- Spine ---------- */
function Spine({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  const vertY = [165, 180, 195, 215, 235, 255, 275, 295, 315, 335, 355, 375, 395, 415, 435];
  return (
    <g filter={active ? `url(#glow-${active})` : undefined} opacity={active ? 1 : 0.5}>
      {/* Spinal column (dashed line connecting vertebrae) */}
      <line x1="200" y1="160" x2="200" y2="450" stroke={color} strokeWidth="0.6" strokeDasharray="2 3" opacity="0.5" />
      {vertY.map((y, i) => (
        <g key={i}>
          <rect x="194" y={y - 2.5} width="12" height="5" rx="1.2" fill={active ? color : "#64748b"} opacity={active ? 0.95 : 0.7} />
          <line x1="187" y1={y} x2="195" y2={y} stroke={color} strokeWidth="0.6" opacity="0.5" />
          <line x1="205" y1={y} x2="213" y2={y} stroke={color} strokeWidth="0.6" opacity="0.5" />
        </g>
      ))}
    </g>
  );
}

/* ---------- Ribcage ---------- */
function Ribcage({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  // Pairs of rib arcs at different y positions
  const ribs = [
    { y: 200, w: 60 },
    { y: 222, w: 70 },
    { y: 244, w: 76 },
    { y: 266, w: 78 },
    { y: 288, w: 76 },
    { y: 310, w: 70 },
  ];
  return (
    <g filter={active ? `url(#glow-${active})` : undefined} opacity={active ? 1 : 0.55}>
      {/* Sternum */}
      <rect x="196" y="200" width="8" height="115" rx="2" fill={active ? color : "#64748b"} opacity={active ? 0.9 : 0.5} />
      {/* Left ribs */}
      {ribs.map((r, i) => (
        <path
          key={`l${i}`}
          d={`M 196 ${r.y} Q ${200 - r.w} ${r.y + 8}, ${200 - r.w} ${r.y + 18}`}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={active ? 0.95 : 0.6}
        />
      ))}
      {/* Right ribs */}
      {ribs.map((r, i) => (
        <path
          key={`r${i}`}
          d={`M 204 ${r.y} Q ${200 + r.w} ${r.y + 8}, ${200 + r.w} ${r.y + 18}`}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={active ? 0.95 : 0.6}
        />
      ))}
    </g>
  );
}

/* ---------- Heart ---------- */
function Heart({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#fb7185";
  return (
    <g opacity={active ? 0.9 : 0.35}>
      <path
        d="M 184 248 C 178 244, 172 246, 172 254 C 172 264, 184 274, 188 278 C 192 274, 204 264, 204 254 C 204 246, 198 244, 192 248 C 190 250, 190 250, 188 252 C 186 250, 186 250, 184 248 Z"
        fill={color}
        opacity="0.4"
      >
        {active && (
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.2s" repeatCount="indefinite" />
        )}
      </path>
    </g>
  );
}

/* ---------- Arms ---------- */
function Arms({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  return (
    <g filter={active ? `url(#glow-${active})` : undefined} opacity={active ? 1 : 0.55}>
      {/* Shoulder joints */}
      <circle cx="138" cy="195" r="6" fill={color} opacity={active ? 0.9 : 0.5} />
      <circle cx="262" cy="195" r="6" fill={color} opacity={active ? 0.9 : 0.5} />
      {/* Humerus (upper arm bones, inside silhouette) */}
      <line x1="138" y1="200" x2="124" y2="310" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="262" y1="200" x2="276" y2="310" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      {/* Elbows */}
      <circle cx="124" cy="312" r="5" fill={color} opacity={active ? 0.9 : 0.5} />
      <circle cx="276" cy="312" r="5" fill={color} opacity={active ? 0.9 : 0.5} />
      {/* Forearm bones (ulna + radius hint) */}
      <line x1="124" y1="316" x2="118" y2="420" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="128" y1="316" x2="122" y2="420" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity={active ? 0.8 : 0.4} />
      <line x1="276" y1="316" x2="282" y2="420" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="272" y1="316" x2="278" y2="420" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity={active ? 0.8 : 0.4} />
      {/* Hands */}
      <ellipse cx="120" cy="430" rx="9" ry="14" fill={color} opacity={active ? 0.8 : 0.4} />
      <ellipse cx="280" cy="430" rx="9" ry="14" fill={color} opacity={active ? 0.8 : 0.4} />
    </g>
  );
}

/* ---------- Pelvis ---------- */
function Pelvis({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  return (
    <g opacity={active ? 0.95 : 0.55}>
      <path
        d="M 200 440 Q 162 450, 152 480 Q 158 510, 200 500 Q 242 510, 248 480 Q 238 450, 200 440 Z"
        fill={active ? color : "transparent"}
        fillOpacity={active ? 0.25 : 0}
        stroke={color}
        strokeWidth="1.4"
      />
    </g>
  );
}

/* ---------- Legs ---------- */
function Legs({ active }: { active: StatKind | null }) {
  const color = active ? STAT_HEX[active] : "#94a3b8";
  return (
    <g filter={active ? `url(#glow-${active})` : undefined} opacity={active ? 1 : 0.55}>
      {/* Hip joints */}
      <circle cx="180" cy="500" r="7" fill={color} opacity={active ? 0.9 : 0.5} />
      <circle cx="220" cy="500" r="7" fill={color} opacity={active ? 0.9 : 0.5} />
      {/* Femur (upper leg) */}
      <line x1="180" y1="505" x2="170" y2="630" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="220" y1="505" x2="230" y2="630" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      {/* Knees */}
      <circle cx="170" cy="632" r="6" fill={color} opacity={active ? 0.9 : 0.5} />
      <circle cx="230" cy="632" r="6" fill={color} opacity={active ? 0.9 : 0.5} />
      {/* Tibia / Fibula */}
      <line x1="170" y1="636" x2="166" y2="760" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="174" y1="636" x2="170" y2="760" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity={active ? 0.7 : 0.35} />
      <line x1="230" y1="636" x2="234" y2="760" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <line x1="226" y1="636" x2="230" y2="760" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity={active ? 0.7 : 0.35} />
      {/* Ankles */}
      <circle cx="167" cy="762" r="5" fill={color} opacity={active ? 0.9 : 0.5} />
      <circle cx="233" cy="762" r="5" fill={color} opacity={active ? 0.9 : 0.5} />
      {/* Feet */}
      <ellipse cx="167" cy="775" rx="11" ry="6" fill={color} opacity={active ? 0.8 : 0.4} />
      <ellipse cx="233" cy="775" rx="11" ry="6" fill={color} opacity={active ? 0.8 : 0.4} />
    </g>
  );
}
