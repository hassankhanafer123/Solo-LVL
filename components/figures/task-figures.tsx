"use client";

import { motion, AnimatePresence } from "motion/react";
import type { StatKind } from "@/lib/types";

/**
 * Animated SVG figures that clearly show a person doing each task.
 *
 * Drawn as recognizable human silhouettes (head, torso, limbs) in
 * task-specific poses with CSS-driven animations:
 *
 *   INT — person sitting cross-legged, reading a book, page turns
 *   STR — person in push-up plank position, body rises and falls
 *   DIS — person in lotus meditation pose, slow breathing scale
 *
 * Each figure stays on-screen during its scroll section and crossfades
 * with the next one.
 */

export type FigureMode = "idle" | StatKind;

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};
const BASE_COLOR = "#7dd3fc";

export function TaskFigure({ mode }: { mode: FigureMode }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center">
      <AnimatePresence mode="wait">
        {mode === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-[42vmin] h-[42vmin] max-w-[420px] max-h-[420px]"
          >
            <IdleFigure />
          </motion.div>
        )}
        {mode === "INT" && (
          <motion.div
            key="int"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -10 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-[42vmin] h-[42vmin] max-w-[420px] max-h-[420px]"
          >
            <ReadingFigure />
          </motion.div>
        )}
        {mode === "STR" && (
          <motion.div
            key="str"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -10 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-[55vmin] h-[42vmin] max-w-[600px] max-h-[420px]"
          >
            <PushupFigure />
          </motion.div>
        )}
        {mode === "DIS" && (
          <motion.div
            key="dis"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -10 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-[42vmin] h-[42vmin] max-w-[420px] max-h-[420px]"
          >
            <MeditateFigure />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
 * IDLE — standing figure
 * ============================================================ */
function IdleFigure() {
  const color = BASE_COLOR;
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" style={{ filter: `drop-shadow(0 0 24px ${color}44)` }}>
      <g className="figure-idle-breath" style={{ transformOrigin: "200px 250px" }}>
        {/* Head */}
        <circle cx="200" cy="100" r="32" fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx="200" cy="100" r="32" fill={color} fillOpacity="0.12" />
        {/* Neck */}
        <line x1="200" y1="132" x2="200" y2="148" stroke={color} strokeWidth="2.5" />
        {/* Torso (rounded rectangle) */}
        <path d="M 165 148 L 235 148 L 240 240 L 200 250 L 160 240 Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Arms */}
        <line x1="165" y1="160" x2="150" y2="240" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="150" y1="240" x2="146" y2="290" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="235" y1="160" x2="250" y2="240" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="250" y1="240" x2="254" y2="290" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Hands */}
        <circle cx="146" cy="294" r="6" fill={color} />
        <circle cx="254" cy="294" r="6" fill={color} />
        {/* Pelvis */}
        <path d="M 160 240 L 200 250 L 240 240 L 235 260 L 200 268 L 165 260 Z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2" />
        {/* Legs */}
        <line x1="180" y1="265" x2="178" y2="360" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <line x1="220" y1="265" x2="222" y2="360" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Feet */}
        <ellipse cx="178" cy="365" rx="10" ry="5" fill={color} />
        <ellipse cx="222" cy="365" rx="10" ry="5" fill={color} />
      </g>
      <style>{`
        .figure-idle-breath { animation: idleBreath 3.6s ease-in-out infinite; }
        @keyframes idleBreath {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.012) translateY(-2px); }
        }
      `}</style>
    </svg>
  );
}

/* ============================================================
 * INT — reading figure (sitting cross-legged with book)
 * ============================================================ */
function ReadingFigure() {
  const color = STAT_HEX.INT;
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" style={{ filter: `drop-shadow(0 0 30px ${color}66)` }}>
      <g className="figure-read-bob" style={{ transformOrigin: "200px 260px" }}>
        {/* Head — tilted slightly down */}
        <g style={{ transformOrigin: "200px 130px" }} className="figure-read-headtilt">
          <circle cx="200" cy="130" r="30" fill="none" stroke={color} strokeWidth="2.5" />
          <circle cx="200" cy="130" r="30" fill={color} fillOpacity="0.12" />
          {/* Hair suggestion */}
          <path d="M 172 115 Q 200 95, 228 115" fill="none" stroke={color} strokeWidth="2.5" />
          {/* Eyes looking down at book */}
          <circle cx="190" cy="138" r="1.8" fill={color} />
          <circle cx="210" cy="138" r="1.8" fill={color} />
        </g>
        {/* Neck */}
        <line x1="200" y1="160" x2="200" y2="172" stroke={color} strokeWidth="2.5" />
        {/* Torso — bent forward */}
        <path d="M 168 172 L 232 172 L 240 250 L 160 250 Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Both arms forward to hold book */}
        <line x1="168" y1="180" x2="150" y2="225" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="150" y1="225" x2="170" y2="245" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="232" y1="180" x2="250" y2="225" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="250" y1="225" x2="230" y2="245" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Book in hands */}
        <g style={{ transformOrigin: "200px 245px" }} className="figure-read-book">
          <path d="M 165 245 L 235 245 L 235 265 L 200 270 L 165 265 Z" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />
          {/* Spine of book */}
          <line x1="200" y1="245" x2="200" y2="268" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.6" />
          {/* Page lines (left) */}
          <line x1="172" y1="252" x2="195" y2="253" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="172" y1="257" x2="195" y2="258" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="172" y1="262" x2="195" y2="263" stroke={color} strokeWidth="1" opacity="0.7" />
          {/* Page lines (right) */}
          <line x1="205" y1="252" x2="228" y2="253" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="205" y1="257" x2="228" y2="258" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="205" y1="262" x2="228" y2="263" stroke={color} strokeWidth="1" opacity="0.7" />
          {/* Page-turn animation: a moving page on top */}
          <path
            className="figure-read-page"
            d="M 200 245 L 230 245 L 230 268 L 200 270 Z"
            fill={color}
            fillOpacity="0.4"
            stroke={color}
            strokeWidth="1.5"
            style={{ transformOrigin: "200px 257px" }}
          />
        </g>
        {/* Crossed legs (lotus-ish sitting position) */}
        {/* Left leg crossed in front */}
        <path d="M 160 250 Q 145 290, 180 305 L 220 310 L 245 295 L 240 280 L 215 285 Z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Right leg crossed behind */}
        <path d="M 240 250 Q 255 290, 220 305 L 180 310 L 155 295 L 160 280 L 185 285 Z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Floor cushion suggestion */}
        <ellipse cx="200" cy="335" rx="100" ry="10" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
      </g>
      {/* Floating equation/letters */}
      <g className="figure-read-floaters" opacity="0.7">
        <text x="80" y="110" fill={color} fontSize="14" fontFamily="ui-monospace, monospace" opacity="0.6">∫</text>
        <text x="320" y="140" fill={color} fontSize="12" fontFamily="ui-monospace, monospace" opacity="0.5">x²</text>
        <text x="100" y="180" fill={color} fontSize="10" fontFamily="ui-monospace, monospace" opacity="0.4">α</text>
        <text x="310" y="90" fill={color} fontSize="11" fontFamily="ui-monospace, monospace" opacity="0.55">π</text>
        <text x="60" y="160" fill={color} fontSize="10" fontFamily="ui-monospace, monospace" opacity="0.45">∑</text>
      </g>
      <style>{`
        .figure-read-bob { animation: readBob 4s ease-in-out infinite; }
        .figure-read-headtilt { animation: readHeadTilt 6s ease-in-out infinite; transform-origin: 200px 130px; }
        .figure-read-book { animation: readBookSway 4s ease-in-out infinite; }
        .figure-read-page { animation: readPageTurn 5s ease-in-out infinite; }
        .figure-read-floaters text { animation: readFloat 4s ease-in-out infinite; }
        .figure-read-floaters text:nth-child(2) { animation-delay: 0.6s; }
        .figure-read-floaters text:nth-child(3) { animation-delay: 1.2s; }
        .figure-read-floaters text:nth-child(4) { animation-delay: 1.8s; }
        .figure-read-floaters text:nth-child(5) { animation-delay: 2.4s; }
        @keyframes readBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes readHeadTilt {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes readBookSway {
          0%, 100% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
        }
        @keyframes readPageTurn {
          0%, 70%, 100% { transform: rotateY(0deg); }
          80%, 90% { transform: rotateY(-160deg); }
        }
        @keyframes readFloat {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-12px); opacity: 0.7; }
        }
      `}</style>
    </svg>
  );
}

/* ============================================================
 * STR — push-up figure (side view, plank → bottom → plank)
 * ============================================================ */
function PushupFigure() {
  const color = STAT_HEX.STR;
  return (
    <svg viewBox="0 0 600 400" className="w-full h-full" style={{ filter: `drop-shadow(0 0 30px ${color}66)` }}>
      <g className="figure-pushup-bounce" style={{ transformOrigin: "300px 280px" }}>
        {/* Head (looking down, side profile) */}
        <circle cx="170" cy="200" r="26" fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx="170" cy="200" r="26" fill={color} fillOpacity="0.15" />
        {/* Ear */}
        <circle cx="155" cy="205" r="3" fill={color} />
        {/* Neck */}
        <line x1="186" y1="218" x2="200" y2="225" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Torso (horizontal plank) */}
        <path d="M 200 215 L 200 240 L 380 245 L 380 220 Z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Back curve hint */}
        <path d="M 200 218 Q 290 210, 380 222" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
        {/* Front-facing arm (supporting) */}
        <line x1="225" y1="240" x2="225" y2="295" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <line x1="225" y1="295" x2="222" y2="335" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="222" cy="338" rx="12" ry="5" fill={color} />
        {/* Back arm (also supporting, slightly offset for depth) */}
        <line x1="245" y1="240" x2="248" y2="295" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <line x1="248" y1="295" x2="252" y2="335" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        {/* Hips */}
        <path d="M 360 220 L 405 215 L 410 245 L 365 250 Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Legs (extended back, on toes) */}
        <line x1="400" y1="230" x2="490" y2="250" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <line x1="490" y1="250" x2="540" y2="330" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Back leg */}
        <line x1="400" y1="240" x2="490" y2="255" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <line x1="490" y1="255" x2="538" y2="332" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        {/* Feet (toes pointed down) */}
        <ellipse cx="540" cy="335" rx="14" ry="6" fill={color} />
        {/* Floor */}
        <line x1="120" y1="345" x2="580" y2="345" stroke={color} strokeWidth="1.5" opacity="0.4" />
        {/* Floor shadow */}
        <ellipse cx="320" cy="350" rx="220" ry="6" fill={color} fillOpacity="0.1" />
        {/* Effort lines */}
        <g className="figure-pushup-effort" opacity="0.5">
          <line x1="80" y1="195" x2="105" y2="195" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="85" y1="210" x2="100" y2="210" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="80" y1="225" x2="105" y2="225" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
      <style>{`
        .figure-pushup-bounce { animation: pushupBounce 1.6s ease-in-out infinite; }
        .figure-pushup-effort { animation: pushupEffort 1.6s ease-in-out infinite; }
        @keyframes pushupBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(28px); }
        }
        @keyframes pushupEffort {
          0%, 100% { transform: translateX(0); opacity: 0.3; }
          50% { transform: translateX(-8px); opacity: 0.8; }
        }
      `}</style>
    </svg>
  );
}

/* ============================================================
 * DIS — meditating figure (lotus, slow breath)
 * ============================================================ */
function MeditateFigure() {
  const color = STAT_HEX.DIS;
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" style={{ filter: `drop-shadow(0 0 36px ${color}77)` }}>
      {/* Mandala rings on floor */}
      <g opacity="0.55">
        <ellipse cx="200" cy="340" rx="130" ry="14" fill="none" stroke={color} strokeWidth="1.5" className="figure-medit-mandala-1" />
        <ellipse cx="200" cy="340" rx="100" ry="11" fill="none" stroke={color} strokeWidth="1" opacity="0.7" />
        <ellipse cx="200" cy="340" rx="160" ry="17" fill="none" stroke={color} strokeWidth="1" opacity="0.4" />
      </g>
      <g className="figure-medit-breath" style={{ transformOrigin: "200px 280px" }}>
        {/* Aura */}
        <circle cx="200" cy="200" r="160" fill={color} fillOpacity="0.04" className="figure-medit-aura" style={{ transformOrigin: "200px 200px" }} />
        <circle cx="200" cy="200" r="125" fill={color} fillOpacity="0.06" />
        {/* Head */}
        <circle cx="200" cy="130" r="30" fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx="200" cy="130" r="30" fill={color} fillOpacity="0.15" />
        {/* Closed eyes (peaceful) */}
        <path d="M 186 132 Q 192 134, 198 132" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 202 132 Q 208 134, 214 132" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        {/* Mouth — slight smile */}
        <path d="M 192 148 Q 200 152, 208 148" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        {/* Neck */}
        <line x1="200" y1="160" x2="200" y2="172" stroke={color} strokeWidth="2.5" />
        {/* Torso — straight, calm */}
        <path d="M 172 172 L 228 172 L 235 270 L 165 270 Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Both arms resting on knees (palms up gesture) */}
        <line x1="172" y1="180" x2="135" y2="240" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="135" y1="240" x2="155" y2="295" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="228" y1="180" x2="265" y2="240" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="265" y1="240" x2="245" y2="295" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Hands in mudra (palms up) */}
        <g>
          <ellipse cx="155" cy="298" rx="8" ry="5" fill={color} />
          {/* Mudra ring (thumb-index touching) */}
          <circle cx="152" cy="294" r="3" fill="none" stroke={color} strokeWidth="1" />
        </g>
        <g>
          <ellipse cx="245" cy="298" rx="8" ry="5" fill={color} />
          <circle cx="248" cy="294" r="3" fill="none" stroke={color} strokeWidth="1" />
        </g>
        {/* Lotus crossed legs (front view) */}
        {/* Left thigh + foot tucked under right leg */}
        <path d="M 165 270 Q 130 290, 130 320 L 270 320 Q 270 290, 235 270 Z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Crossed foot detail */}
        <ellipse cx="155" cy="315" rx="20" ry="8" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
        <ellipse cx="245" cy="315" rx="20" ry="8" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
      </g>
      {/* Rising particles */}
      <g className="figure-medit-particles">
        {[100, 200, 300].map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={300}
            r="2.5"
            fill={color}
            opacity="0.7"
            style={{ animationDelay: `${i * 0.7}s` }}
            className="figure-medit-particle"
          />
        ))}
      </g>
      <style>{`
        .figure-medit-breath { animation: meditBreath 5s ease-in-out infinite; }
        .figure-medit-aura { animation: meditAura 5s ease-in-out infinite; }
        .figure-medit-mandala-1 { animation: meditMandalaSpin 30s linear infinite; transform-origin: 200px 340px; }
        .figure-medit-particle { animation: meditParticleRise 3s ease-out infinite; }
        @keyframes meditBreath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.018); }
        }
        @keyframes meditAura {
          0%, 100% { transform: scale(1); opacity: 0.04; }
          50% { transform: scale(1.08); opacity: 0.10; }
        }
        @keyframes meditMandalaSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes meditParticleRise {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 0.8; }
          100% { transform: translateY(-180px); opacity: 0; }
        }
      `}</style>
    </svg>
  );
}
