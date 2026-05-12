"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Check,
  Play,
  Pause,
  Minus,
  Plus,
  Lock,
  Sparkles,
  Flame,
  Home as HomeIcon,
  BarChart3,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Zap,
  AlertTriangle,
  Shield,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatKind } from "@/lib/types";
import { HunterFigure, type ZoomTarget } from "@/components/animations/hunter-figure";

/* ----------------------------------------------------------
 * Types & seed data — replaced by Supabase queries in Phase 2
 * ---------------------------------------------------------- */

type Stat = StatKind;

type Control =
  | { kind: "checkbox"; done: boolean }
  | { kind: "count"; actual: number; target: number }
  | { kind: "timer"; elapsedSec: number; targetMin: number; running: boolean };

type Quest = {
  id: string;
  name: string;
  stat: Stat;
  baseXp: number;
  required: boolean;
  penalty?: boolean;
  control: Control;
};

const STAT_META: Record<
  Stat,
  { label: string; bodyPart: string; text: string; chip: string; bar: string; ring: string }
> = {
  STR: { label: "Strength", bodyPart: "Chest", text: "text-rose-300", chip: "bg-rose-500/15 text-rose-300 border-rose-500/30", bar: "from-rose-400 to-rose-600", ring: "ring-rose-500/40" },
  VIT: { label: "Vitality", bodyPart: "Heart", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", bar: "from-emerald-400 to-emerald-600", ring: "ring-emerald-500/40" },
  AGI: { label: "Agility", bodyPart: "Legs", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30", bar: "from-amber-400 to-amber-600", ring: "ring-amber-500/40" },
  INT: { label: "Intellect", bodyPart: "Brain", text: "text-blue-300", chip: "bg-blue-500/15 text-blue-300 border-blue-500/30", bar: "from-blue-400 to-blue-600", ring: "ring-blue-500/40" },
  PER: { label: "Perception", bodyPart: "Eyes", text: "text-purple-300", chip: "bg-purple-500/15 text-purple-300 border-purple-500/30", bar: "from-purple-400 to-purple-600", ring: "ring-purple-500/40" },
};

const INITIAL_QUESTS: Quest[] = [
  { id: "q1", name: "Push-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q2", name: "Sit-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q3", name: "Run", stat: "VIT", baseXp: 75, required: true, control: { kind: "count", actual: 0, target: 5 } },
  { id: "q4", name: "Study", stat: "INT", baseXp: 75, required: true, control: { kind: "timer", elapsedSec: 0, targetMin: 90, running: false } },
  { id: "q5", name: "Read", stat: "INT", baseXp: 25, required: false, control: { kind: "timer", elapsedSec: 0, targetMin: 30, running: false } },
  { id: "q6", name: "Squats — Penalty +50%", stat: "STR", baseXp: 75, required: true, penalty: true, control: { kind: "count", actual: 0, target: 150 } },
];

const INITIAL_PLAYER = {
  name: "HASSAN",
  level: 14,
  title: "Awakened",
  xpInLevel: 420,
  xpToNext: 1000,
  streak: 23,
  stats: { STR: 42, VIT: 38, AGI: 29, INT: 51, PER: 24 } as Record<Stat, number>,
};

const TITLE_FOR_LEVEL = (lv: number) =>
  lv >= 100 ? "Shadow Monarch" : lv >= 50 ? "Necromancer" : lv >= 25 ? "Elite Hunter" : lv >= 10 ? "Awakened" : "Novice";
const XP_TO_NEXT = (lv: number) => Math.ceil(100 * Math.pow(1.4, lv - 1));

function isQuestDone(c: Control): boolean {
  if (c.kind === "checkbox") return c.done;
  if (c.kind === "count") return c.actual >= c.target;
  return c.elapsedSec / 60 >= c.targetMin;
}

/* ----------------------------------------------------------
 * Page
 * ---------------------------------------------------------- */

export default function DashboardPreview() {
  const reduce = useReducedMotion();
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [player, setPlayer] = useState(INITIAL_PLAYER);
  const [xpFloaters, setXpFloaters] = useState<{ id: number; xp: number; x: number; y: number }[]>([]);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState<Stat | null>(null);
  const [transientStat, setTransientStat] = useState<Stat | null>(null);
  const floaterIdRef = useRef(0);
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live timer tick
  useEffect(() => {
    const id = setInterval(() => {
      setQuests((prev) => {
        let touched = false;
        const next = prev.map((q) => {
          if (q.control.kind !== "timer" || !q.control.running) return q;
          touched = true;
          const newElapsed = q.control.elapsedSec + 1;
          const reached = newElapsed / 60 >= q.control.targetMin;
          if (reached) {
            fireXpGain(q.baseXp);
            return { ...q, control: { ...q.control, elapsedSec: q.control.targetMin * 60, running: false } };
          }
          return { ...q, control: { ...q.control, elapsedSec: newElapsed } };
        });
        return touched ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredQuests = useMemo(() => quests.filter((q) => q.required), [quests]);
  const remaining = useMemo(() => requiredQuests.filter((q) => !isQuestDone(q.control)).length, [requiredQuests]);
  const totalRequired = requiredQuests.length;
  const cleared = remaining === 0;
  const runningTimer = quests.find((q) => q.control.kind === "timer" && q.control.running);

  // Stable zoom resolution: running timer > activeFilter > transient > full
  const zoom: ZoomTarget = useMemo(() => {
    if (runningTimer) return runningTimer.stat;
    if (activeStatFilter) return activeStatFilter;
    if (transientStat) return transientStat;
    return "full";
  }, [runningTimer, activeStatFilter, transientStat]);

  const visibleQuests = activeStatFilter ? quests.filter((q) => q.stat === activeStatFilter) : quests;

  const triggerZoom = useCallback((stat: Stat) => {
    if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
    setTransientStat(stat);
    transientTimerRef.current = setTimeout(() => setTransientStat(null), 2000);
  }, []);

  function fireXpGain(amount: number) {
    if (amount <= 0) return;
    const id = ++floaterIdRef.current;
    setXpFloaters((prev) => [...prev, { id, xp: amount, x: 30 + Math.random() * 40, y: 50 }]);
    setTimeout(() => setXpFloaters((prev) => prev.filter((f) => f.id !== id)), 1400);

    setPlayer((p) => {
      let level = p.level;
      let xpInLevel = p.xpInLevel + amount;
      let xpToNext = p.xpToNext;
      let title = p.title;
      let leveled = false;
      while (xpInLevel >= xpToNext) {
        xpInLevel -= xpToNext;
        level += 1;
        xpToNext = XP_TO_NEXT(level);
        title = TITLE_FOR_LEVEL(level);
        leveled = true;
      }
      if (leveled) setTimeout(() => setLevelUpVisible(true), 350);
      return { ...p, level, xpInLevel, xpToNext, title };
    });
    if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(25);
  }

  function toggleCheckbox(id: string) {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "checkbox") return q;
        const newDone = !q.control.done;
        if (newDone) {
          fireXpGain(q.baseXp);
          triggerZoom(q.stat);
        }
        return { ...q, control: { kind: "checkbox", done: newDone } };
      }),
    );
  }

  function bumpCount(id: string, delta: number) {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "count") return q;
        const wasDone = q.control.actual >= q.control.target;
        const actual = Math.max(0, q.control.actual + delta);
        const nowDone = actual >= q.control.target;
        if (delta > 0) triggerZoom(q.stat);
        if (!wasDone && nowDone) fireXpGain(q.baseXp);
        return { ...q, control: { ...q.control, actual } };
      }),
    );
    if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  }

  function toggleTimer(id: string) {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "timer") return q;
        return { ...q, control: { ...q.control, running: !q.control.running } };
      }),
    );
  }

  function resetDay() {
    setQuests(INITIAL_QUESTS);
    setPlayer(INITIAL_PLAYER);
    setActiveStatFilter(null);
    setTransientStat(null);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      {/* Background mesh */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="absolute inset-0 animate-mesh-drift bg-[radial-gradient(ellipse_30%_25%_at_20%_30%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(ellipse_25%_25%_at_80%_70%,rgba(59,130,246,0.16),transparent_60%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[300px] bg-[radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.12),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)",
          }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-28 space-y-6">
        {/* Brand bar */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between text-[10px] font-mono tracking-[0.4em] uppercase"
        >
          <div className="flex items-center gap-2 text-blue-300/90">
            <Shield className="h-3 w-3" strokeWidth={2.5} />
            <span>System · v0.1</span>
          </div>
          <button
            onClick={resetDay}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
            Reset
          </button>
        </motion.div>

        {/* HERO: Hunter Figure + player meta on the side */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
        >
          {/* Figure column */}
          <div className="relative">
            <HunterFigure zoom={zoom} />
            {/* XP floaters anchored over figure */}
            <div className="pointer-events-none absolute inset-0">
              <AnimatePresence>
                {xpFloaters.map((f) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 10, scale: 0.6 }}
                    animate={{ opacity: 1, y: -80, scale: 1.15 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute font-mono text-lg font-bold text-blue-300 drop-shadow-[0_0_12px_rgba(59,130,246,0.9)]"
                    style={{ left: `${f.x}%`, top: `${f.y}%` }}
                  >
                    +{f.xp} XP
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Player meta column */}
          <div className="flex flex-col gap-4">
            {/* Player ID */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950 p-5 backdrop-blur-xl">
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/70 to-transparent" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono tracking-[0.3em] text-slate-500 mb-1">HUNTER ID</div>
                  <h1 className="text-3xl font-bold tracking-tight">{player.name}</h1>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-xs text-slate-400">
                    <span className="text-blue-300">{player.title}</span>
                    <span className="text-slate-700">·</span>
                    <span className="flex items-center gap-1 text-orange-300">
                      <Flame className="h-3 w-3 animate-flame" strokeWidth={2.5} />
                      {player.streak}d
                    </span>
                  </div>
                </div>
                <motion.div
                  key={player.level}
                  initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18 }}
                  className="relative flex h-20 w-20 shrink-0 items-center justify-center"
                >
                  <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                    <defs>
                      <linearGradient id="hex" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="url(#hex)" opacity="0.18" stroke="url(#hex)" strokeWidth="2" />
                    <polygon points="50,12 84,31 84,69 50,88 16,69 16,31" fill="none" stroke="#3b82f6" strokeWidth="0.6" opacity="0.5" />
                  </svg>
                  <div className="relative text-center">
                    <div className="text-[9px] font-mono tracking-widest text-blue-300/80">LV</div>
                    <div className="text-2xl font-bold leading-none text-white">{player.level}</div>
                  </div>
                </motion.div>
              </div>

              {/* XP bar */}
              <div className="mt-5 space-y-1.5">
                <div className="relative h-3.5 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-slate-700/50">
                  <motion.div
                    initial={false}
                    animate={{ width: `${Math.min(100, (player.xpInLevel / player.xpToNext) * 100)}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-blue-400 to-purple-500 shadow-[0_0_22px_rgba(59,130,246,0.7)]"
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] animate-shimmer" />
                  </motion.div>
                </div>
                <div className="flex justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-slate-400">
                    <span className="text-blue-300">{player.xpInLevel}</span>
                    <span className="text-slate-600"> / {player.xpToNext} XP</span>
                  </span>
                  <span className="text-slate-500">to Lv {player.level + 1}</span>
                </div>
              </div>
            </div>

            {/* Discipline focus row */}
            <div>
              <div className="flex items-end justify-between mb-2">
                <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
                  Tap a region · Zoom in
                </h2>
                {(activeStatFilter || zoom !== "full") && (
                  <button
                    onClick={() => {
                      setActiveStatFilter(null);
                      setTransientStat(null);
                    }}
                    className="text-[10px] font-mono uppercase tracking-widest text-blue-300 hover:text-blue-200"
                  >
                    Pull back ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {(Object.keys(STAT_META) as Stat[]).map((s, idx) => (
                  <StatPin
                    key={s}
                    stat={s}
                    value={player.stats[s]}
                    active={zoom === s}
                    onClick={() => {
                      setActiveStatFilter((prev) => (prev === s ? null : s));
                    }}
                    delay={0.18 + idx * 0.06}
                    reduce={reduce ?? false}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Relax Gate */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <AnimatePresence mode="wait">
            {cleared ? <ClearedGate key="cleared" /> : <LockedGate key="locked" remaining={remaining} total={totalRequired} />}
          </AnimatePresence>
        </motion.section>

        {/* Today */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
              Today’s Quests
              {activeStatFilter && (
                <span className={cn("ml-2", STAT_META[activeStatFilter].text)}>
                  · {STAT_META[activeStatFilter].label} only
                </span>
              )}
            </h2>
            <span className="font-mono text-[10px] tabular-nums text-slate-500">
              {totalRequired - remaining} / {totalRequired} required cleared
            </span>
          </div>

          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {visibleQuests.map((q, idx) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  index={idx}
                  zoomedOn={zoom === q.stat}
                  onCheck={() => toggleCheckbox(q.id)}
                  onBump={(d) => bumpCount(q.id, d)}
                  onTimer={() => toggleTimer(q.id)}
                  onHover={() => triggerZoom(q.stat)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <p className="pt-2 text-center text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600">
          Preview · Phase 2 wires this to Supabase
        </p>
      </div>

      <AnimatePresence>
        {levelUpVisible && <LevelUpOverlay level={player.level} title={player.title} onClose={() => setLevelUpVisible(false)} />}
      </AnimatePresence>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NavItem icon={HomeIcon} label="Home" active />
          <NavItem icon={BarChart3} label="Stats" />
          <NavItem icon={HistoryIcon} label="History" />
          <NavItem icon={SettingsIcon} label="Settings" />
        </div>
      </nav>
    </main>
  );
}

/* ----------------------------------------------------------
 * Stat zoom pin (5 small buttons under figure)
 * ---------------------------------------------------------- */

function StatPin({
  stat,
  value,
  active,
  onClick,
  delay,
  reduce,
}: {
  stat: Stat;
  value: number;
  active: boolean;
  onClick: () => void;
  delay: number;
  reduce: boolean;
}) {
  const meta = STAT_META[stat];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { scale: 1.04, y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      className={cn(
        "group flex flex-col items-center gap-0.5 rounded-xl border bg-slate-900/40 p-2 backdrop-blur-sm transition-colors",
        active ? cn("ring-2 ring-offset-2 ring-offset-slate-950", meta.ring, "border-transparent") : "border-slate-800/80 hover:border-slate-700",
      )}
      aria-pressed={active}
    >
      <div className={cn("font-mono text-[9px] font-bold tracking-[0.2em]", meta.text)}>{stat}</div>
      <div className="font-mono text-base font-bold tabular-nums text-slate-100 leading-tight">{value}</div>
      <div className="font-mono text-[8px] tracking-widest text-slate-500 uppercase">{meta.bodyPart}</div>
    </motion.button>
  );
}

/* ----------------------------------------------------------
 * Relax Gate variants
 * ---------------------------------------------------------- */

function LockedGate({ remaining, total }: { remaining: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/50 to-slate-950 p-6 text-center animate-pulse-glow-red"
    >
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, #ef4444 0 10px, transparent 10px 22px)" }}
      />
      <div className="relative">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 ring-2 ring-red-500/40">
          <Lock className="h-6 w-6 text-red-300" strokeWidth={2.5} />
        </div>
        <div className="font-mono text-2xl font-bold tracking-[0.4em] text-red-300">LOCKED</div>
        <div className="mt-2 text-sm text-red-200/80">
          <span className="font-mono text-2xl font-bold text-red-100 tabular-nums">{remaining}</span>
          <span className="ml-1 text-red-200/70"> of {total} quests remain</span>
        </div>
        <div className="mt-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300/70">Train, Hunter.</div>
      </div>
    </motion.div>
  );
}

function ClearedGate() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/60 to-slate-950 p-6 text-center shadow-[0_0_60px_rgba(16,185,129,0.25)]"
    >
      <div className="absolute inset-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: [0, 0.4, 0], scaleY: [0, 1, 1] }}
            transition={{ duration: 1.2, delay: i * 0.05 }}
            className="absolute left-1/2 top-1/2 h-32 w-px origin-bottom -translate-x-1/2 bg-emerald-400/60"
            style={{ transform: `translate(-50%, -100%) rotate(${i * 45}deg)` }}
          />
        ))}
      </div>
      <div className="relative">
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 ring-2 ring-emerald-400/60"
        >
          <Check className="h-7 w-7 text-emerald-300" strokeWidth={3} />
        </motion.div>
        <div className="font-mono text-2xl font-bold tracking-[0.4em] text-emerald-300">CLEARED</div>
        <div className="mt-1 text-sm text-emerald-200/80">You may rest, Hunter.</div>
        <div className="mt-2 text-[11px] font-mono uppercase tracking-[0.25em] text-emerald-300/60">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------
 * Quest card
 * ---------------------------------------------------------- */

function QuestCard({
  quest,
  index,
  zoomedOn,
  onCheck,
  onBump,
  onTimer,
  onHover,
}: {
  quest: Quest;
  index: number;
  zoomedOn: boolean;
  onCheck: () => void;
  onBump: (delta: number) => void;
  onTimer: () => void;
  onHover: () => void;
}) {
  const meta = STAT_META[quest.stat];
  const done = isQuestDone(quest.control);

  const progress =
    quest.control.kind === "count"
      ? quest.control.target > 0
        ? Math.min(100, (quest.control.actual / quest.control.target) * 100)
        : 0
      : quest.control.kind === "timer"
        ? Math.min(100, (quest.control.elapsedSec / (quest.control.targetMin * 60)) * 100)
        : done
          ? 100
          : 0;

  const isTimerRunning = quest.control.kind === "timer" && quest.control.running;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: done ? 0.7 : 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={onHover}
      onTouchStart={onHover}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-slate-900/40 px-4 py-3.5 backdrop-blur-sm transition-colors",
        done && "border-emerald-500/30 bg-emerald-950/15",
        !done && quest.penalty && "border-red-500/30 bg-red-950/20",
        !done && !quest.penalty && (zoomedOn ? cn("ring-2", meta.ring, "border-transparent") : "border-slate-800/80"),
        isTimerRunning && "animate-pulse-glow-blue border-blue-500/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-[0.2em]", meta.chip)}>
              {quest.stat} · {meta.bodyPart}
            </span>
            {quest.penalty && (
              <span className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-red-300">
                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                PENALTY
              </span>
            )}
            {!quest.required && !quest.penalty && (
              <span className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-slate-400">
                OPTIONAL
              </span>
            )}
            {done && (
              <span className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-emerald-300">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                +{quest.baseXp} XP
              </span>
            )}
          </div>
          <div className={cn("text-base font-semibold leading-tight", done ? "text-slate-500 line-through" : "text-slate-100")}>
            {quest.name}
          </div>
          {!done && (
            <div className="mt-0.5 text-[11px] font-mono text-slate-500">
              <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px text-blue-400" strokeWidth={2.5} />
              {quest.baseXp} XP reward
            </div>
          )}
        </div>

        <div className="shrink-0">
          {quest.control.kind === "checkbox" && (
            <motion.button
              type="button"
              onClick={onCheck}
              whileTap={{ scale: 0.88 }}
              aria-label={done ? "Mark incomplete" : "Mark done"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors",
                done ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-slate-700 bg-slate-800/60 hover:border-blue-400 hover:bg-blue-500/10",
              )}
            >
              {done && <Check className="h-5 w-5" strokeWidth={3} />}
            </motion.button>
          )}

          {quest.control.kind === "count" && (
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                onClick={() => onBump(-1)}
                whileTap={{ scale: 0.88 }}
                aria-label="Decrement"
                disabled={done}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 transition-colors hover:border-slate-600 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => onBump(+1)}
                whileTap={{ scale: 0.88 }}
                aria-label="Increment"
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors",
                  done ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
                )}
              >
                <Plus className="h-4 w-4" strokeWidth={3} />
              </motion.button>
            </div>
          )}

          {quest.control.kind === "timer" && (
            <motion.button
              type="button"
              onClick={onTimer}
              whileTap={{ scale: 0.88 }}
              disabled={done}
              aria-label={quest.control.running ? "Pause timer" : "Start timer"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors disabled:opacity-40",
                quest.control.running
                  ? "border-red-400/60 bg-red-500/15 text-red-300"
                  : done
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
              )}
            >
              {done ? <Check className="h-5 w-5" strokeWidth={3} /> : quest.control.running ? <Pause className="h-5 w-5" strokeWidth={2.5} fill="currentColor" /> : <Play className="h-5 w-5 translate-x-px" strokeWidth={2.5} fill="currentColor" />}
            </motion.button>
          )}
        </div>
      </div>

      {quest.control.kind !== "checkbox" && (
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/80">
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 18 }}
              className={cn(
                "h-full rounded-full",
                done ? "bg-emerald-500" : quest.penalty ? "bg-gradient-to-r from-red-400 to-red-600" : "bg-gradient-to-r from-blue-500 to-purple-500",
              )}
            />
          </div>
          <div className="font-mono text-[11px] tabular-nums text-slate-400 min-w-[70px] text-right">
            {quest.control.kind === "count" && (
              <>
                <span className={done ? "text-emerald-300" : "text-slate-200"}>{quest.control.actual}</span>
                <span className="text-slate-600"> / {quest.control.target}</span>
              </>
            )}
            {quest.control.kind === "timer" && (
              <>
                <span className={done ? "text-emerald-300" : "text-slate-200"}>{formatMmSs(quest.control.elapsedSec)}</span>
                <span className="text-slate-600"> / {String(quest.control.targetMin).padStart(2, "0")}:00</span>
              </>
            )}
          </div>
        </div>
      )}
    </motion.li>
  );
}

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function NavItem({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors min-h-[44px] min-w-[44px]",
        active ? "text-blue-300" : "text-slate-500 hover:text-slate-300",
      )}
    >
      <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_rgba(59,130,246,0.7)]")} strokeWidth={2.25} />
      <span>{label}</span>
    </motion.button>
  );
}

function LevelUpOverlay({
  level,
  title,
  onClose,
}: {
  level: number;
  title: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.6, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="relative max-w-sm w-full rounded-3xl border-2 border-blue-500/60 bg-gradient-to-b from-blue-950/90 to-slate-950 p-8 text-center shadow-[0_0_80px_rgba(59,130,246,0.4)]"
      >
        <motion.div
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-3xl border border-dashed border-blue-400/30"
        />
        <div className="relative">
          <motion.div
            initial={{ scale: 0.4, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 12, delay: 0.1 }}
            className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 ring-2 ring-blue-400/60"
          >
            <Zap className="h-8 w-8 text-blue-300" strokeWidth={2.5} fill="currentColor" />
          </motion.div>
          <div className="font-mono text-xs tracking-[0.5em] text-blue-300/80">LEVEL UP</div>
          <div className="mt-2 text-5xl font-extrabold tracking-tight text-white">Lv {level}</div>
          <div className="mt-1 font-mono text-sm text-blue-200">{title}</div>
          <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 font-mono text-xs text-blue-100">
            <Sparkles className="inline h-3 w-3 -translate-y-px mr-1" />
            +5 stat points to allocate
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.55)] transition"
          >
            Continue
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
