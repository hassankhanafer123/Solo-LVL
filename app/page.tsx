"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Check,
  Play,
  Pause,
  Minus,
  Plus,
  Sparkles,
  Flame,
  RotateCcw,
  TrendingUp,
  Trophy,
  Calendar,
  ChevronRight,
} from "lucide-react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import type { StatKind } from "@/lib/types";
import { StudioCursor } from "@/components/cursor";
import { ActivityRings, CountUp } from "@/components/animations/activity-rings";
import { TiltCard } from "@/components/tilt-card";
import dynamic from "next/dynamic";

const HeroScene = dynamic(
  () => import("@/components/scene/hero-scene").then((m) => m.HeroScene),
  { ssr: false, loading: () => <SceneSkeleton /> },
);

/* -------- Types & seed (replaced by Supabase in Phase 2) -------- */

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
  { label: string; emoji: string; tint: string; bar: string; ring: string }
> = {
  STR: { label: "Strength", emoji: "💪", tint: "text-rose-300", bar: "from-rose-400 to-rose-600", ring: "ring-rose-500/40" },
  VIT: { label: "Vitality", emoji: "❤️", tint: "text-emerald-300", bar: "from-emerald-400 to-emerald-600", ring: "ring-emerald-500/40" },
  AGI: { label: "Agility", emoji: "⚡", tint: "text-amber-300", bar: "from-amber-400 to-amber-600", ring: "ring-amber-500/40" },
  INT: { label: "Intellect", emoji: "🧠", tint: "text-blue-300", bar: "from-blue-400 to-blue-600", ring: "ring-blue-500/40" },
  PER: { label: "Perception", emoji: "👁", tint: "text-purple-300", bar: "from-purple-400 to-purple-600", ring: "ring-purple-500/40" },
};

const INITIAL_QUESTS: Quest[] = [
  { id: "q1", name: "Push-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q2", name: "Sit-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q3", name: "Run", stat: "VIT", baseXp: 75, required: true, control: { kind: "count", actual: 0, target: 5 } },
  { id: "q4", name: "Study", stat: "INT", baseXp: 75, required: true, control: { kind: "timer", elapsedSec: 0, targetMin: 90, running: false } },
  { id: "q5", name: "Read", stat: "INT", baseXp: 25, required: false, control: { kind: "timer", elapsedSec: 0, targetMin: 30, running: false } },
  { id: "q6", name: "Squats (penalty +50%)", stat: "STR", baseXp: 75, required: true, penalty: true, control: { kind: "count", actual: 0, target: 150 } },
];

const INITIAL_PLAYER = {
  name: "Hassan",
  level: 14,
  title: "Awakened",
  xpInLevel: 420,
  xpToNext: 1000,
  streak: 23,
  stats: { STR: 42, VIT: 38, AGI: 29, INT: 51, PER: 24 } as Record<Stat, number>,
  // 30-day completion heat (1 = cleared, 0 = missed, 0.4 = partial)
  heat: [1,1,1,0,1,1,1,1,1,1,0.4,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0.4] as number[],
};

const TITLE_FOR_LEVEL = (lv: number) =>
  lv >= 100 ? "Shadow Monarch" : lv >= 50 ? "Necromancer" : lv >= 25 ? "Elite Hunter" : lv >= 10 ? "Awakened" : "Novice";
const XP_TO_NEXT = (lv: number) => Math.ceil(100 * Math.pow(1.4, lv - 1));

function isQuestDone(c: Control): boolean {
  if (c.kind === "checkbox") return c.done;
  if (c.kind === "count") return c.actual >= c.target;
  return c.elapsedSec / 60 >= c.targetMin;
}

const STAT_HEX: Record<Stat, [string, string, string]> = {
  STR: ["#fb7185", "#e11d48", "rgba(244,63,94,0.5)"],
  VIT: ["#34d399", "#059669", "rgba(16,185,129,0.5)"],
  AGI: ["#fbbf24", "#d97706", "rgba(245,158,11,0.5)"],
  INT: ["#60a5fa", "#1d4ed8", "rgba(59,130,246,0.5)"],
  PER: ["#c084fc", "#7c3aed", "rgba(168,85,247,0.5)"],
};

/* -------- Page -------- */

export default function Dashboard() {
  const reduce = useReducedMotion();
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [player, setPlayer] = useState(INITIAL_PLAYER);
  const [activeStatFilter, setActiveStatFilter] = useState<Stat | null>(null);
  const [hoveredStat, setHoveredStat] = useState<Stat | null>(null);
  const [burstStat, setBurstStat] = useState<Stat | null>(null);
  const [burstId, setBurstId] = useState(0);
  const [pulseTrigger, setPulseTrigger] = useState(0);

  // Timer tick
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
            fireXp(q.baseXp);
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
  const completedRequired = requiredQuests.filter((q) => isQuestDone(q.control)).length;
  const totalRequired = requiredQuests.length;
  const remaining = totalRequired - completedRequired;
  const cleared = remaining === 0;

  const totalXpToday = useMemo(
    () => quests.filter((q) => isQuestDone(q.control)).reduce((s, q) => s + q.baseXp, 0),
    [quests],
  );
  const xpGoalToday = 300;

  const activeMinutes = useMemo(() => {
    let m = 0;
    quests.forEach((q) => {
      if (q.control.kind === "timer") m += Math.floor(q.control.elapsedSec / 60);
      if (q.control.kind === "count" && isQuestDone(q.control)) m += 5;
    });
    return m;
  }, [quests]);

  const visibleQuests = activeStatFilter ? quests.filter((q) => q.stat === activeStatFilter) : quests;

  function fireConfetti(originX: number, originY: number, colors: string[]) {
    confetti({
      particleCount: 60,
      spread: 65,
      startVelocity: 36,
      origin: { x: originX, y: originY },
      colors,
      scalar: 0.9,
      ticks: 130,
    });
  }

  function fireXp(amount: number) {
    if (amount <= 0) return;
    setPlayer((p) => {
      let level = p.level;
      let xpInLevel = p.xpInLevel + amount;
      let xpToNext = p.xpToNext;
      let title = p.title;
      while (xpInLevel >= xpToNext) {
        xpInLevel -= xpToNext;
        level += 1;
        xpToNext = XP_TO_NEXT(level);
        title = TITLE_FOR_LEVEL(level);
      }
      return { ...p, level, xpInLevel, xpToNext, title };
    });
    setPulseTrigger((n) => n + 1);
    if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(20);
  }

  function fireBurst(stat: Stat) {
    setBurstStat(stat);
    setBurstId((n) => n + 1);
  }

  const completeQuestRef = useRef<HTMLDivElement | null>(null);

  function toggleCheckbox(id: string, e?: React.MouseEvent) {
    const card = (e?.currentTarget as HTMLElement)?.closest("[data-quest-card]") as HTMLElement | null;
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "checkbox") return q;
        const newDone = !q.control.done;
        if (newDone) {
          fireXp(q.baseXp);
          fireBurst(q.stat);
          if (card) celebrateAt(card, STAT_HEX[q.stat]);
        }
        return { ...q, control: { kind: "checkbox", done: newDone } };
      }),
    );
  }

  function bumpCount(id: string, delta: number, e?: React.MouseEvent) {
    const card = (e?.currentTarget as HTMLElement)?.closest("[data-quest-card]") as HTMLElement | null;
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "count") return q;
        const wasDone = q.control.actual >= q.control.target;
        const actual = Math.max(0, q.control.actual + delta);
        const nowDone = actual >= q.control.target;
        if (!wasDone && nowDone) {
          fireXp(q.baseXp);
          fireBurst(q.stat);
          if (card) celebrateAt(card, STAT_HEX[q.stat]);
        }
        return { ...q, control: { ...q.control, actual } };
      }),
    );
    if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(6);
  }

  function toggleTimer(id: string) {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "timer") return q;
        return { ...q, control: { ...q.control, running: !q.control.running } };
      }),
    );
  }

  function celebrateAt(el: HTMLElement, colors: string[]) {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2 / window.innerWidth;
    const y = (r.top + r.bottom) / 2 / window.innerHeight;
    fireConfetti(x, y, colors);
  }

  function resetDay() {
    setQuests(INITIAL_QUESTS);
    setPlayer(INITIAL_PLAYER);
    setActiveStatFilter(null);
  }

  const today = new Date();
  const greeting = (() => {
    const h = today.getHours();
    if (h < 5) return "Late night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Late night";
  })();
  const dateStr = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100">
      <StudioCursor />
      <div aria-hidden className="grain" />

      {/* === Live 3D background (full-bleed) === */}
      <HeroScene
        mode={activeStatFilter ?? "idle"}
        hoveredStat={hoveredStat}
        stats={player.stats}
        burstStat={burstStat}
        burstId={burstId}
        pulseTrigger={pulseTrigger}
        xpRatio={player.xpInLevel / player.xpToNext}
        streak={player.streak}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {/* Top bar */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <LogoMark />
            <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-slate-400">
              Solo Leveling Life
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline font-mono text-[11px] tracking-widest uppercase text-slate-500">
              {dateStr}
            </span>
            <button
              onClick={resetDay}
              data-cursor="hover"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-300 hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
              Reset
            </button>
          </div>
        </motion.div>

        {/* Greeting hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 grid grid-cols-12 gap-4 md:gap-6 items-center"
        >
          <div className="col-span-12 lg:col-span-7">
            <div className="font-mono text-[11px] tracking-[0.3em] uppercase text-blue-300">
              {greeting}
            </div>
            <h1 className="mt-2 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white">
              {player.name}.
            </h1>
            <p className="mt-3 max-w-md text-slate-400 text-base">
              {cleared
                ? "Day cleared. You earned your rest."
                : `${remaining} ${remaining === 1 ? "quest" : "quests"} left before you can relax. Let's go.`}
            </p>
          </div>
          <div className="col-span-12 lg:col-span-5 flex justify-start lg:justify-end gap-2">
            <Pill icon={<Trophy className="h-3.5 w-3.5" />} label={`Lv ${player.level}`} sub={player.title} />
            <Pill icon={<Flame className="h-3.5 w-3.5 animate-flame" />} label={`${player.streak}d`} sub="Streak" />
          </div>
        </motion.section>

        {/* === Section tabs (click-to-navigate) === */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-8 flex flex-wrap items-center gap-2"
        >
          <SectionTab
            label="All"
            sub="Overview"
            active={activeStatFilter === null}
            onClick={() => setActiveStatFilter(null)}
          />
          {(Object.keys(STAT_META) as Stat[]).map((s) => (
            <SectionTab
              key={s}
              label={`${STAT_META[s].emoji} ${s}`}
              sub={STAT_META[s].label}
              active={activeStatFilter === s}
              onClick={() => setActiveStatFilter(s)}
            />
          ))}
        </motion.div>

        {/* === Bento === */}
        <div className="mt-5 grid grid-cols-12 gap-4 md:gap-5">
          {/* Activity Rings — today's progress, on top of the 3D background */}
          <TiltCard className="col-span-12 lg:col-span-7 rounded-3xl" intensity={4}>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 p-6 md:p-7 backdrop-blur-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400">
                    Today's progress
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">
                    {cleared ? (
                      <span className="text-emerald-300">All cleared ✓</span>
                    ) : (
                      <span><CountUp to={remaining} duration={500} /> to go</span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-slate-400">
                  <div className="text-blue-300 text-xl font-bold tabular-nums">
                    <CountUp to={totalXpToday} duration={900} />
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500">XP today</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-12 items-center gap-5">
                <div className="col-span-12 sm:col-span-7 flex justify-center">
                  <ActivityRings
                    size={240}
                    centerLabel="Lv"
                    centerValue={String(player.level)}
                    rings={[
                      { label: "Quests", progress: completedRequired / Math.max(1, totalRequired), gradient: ["#fb7185", "#e11d48"], glow: "rgba(244,63,94,0.6)", value: `${completedRequired}/${totalRequired}`, goal: "" },
                      { label: "XP", progress: Math.min(1, totalXpToday / xpGoalToday), gradient: ["#60a5fa", "#7c3aed"], glow: "rgba(59,130,246,0.6)", value: `${totalXpToday}`, goal: "" },
                      { label: "Active", progress: Math.min(1, activeMinutes / 120), gradient: ["#fbbf24", "#d97706"], glow: "rgba(251,191,36,0.6)", value: `${activeMinutes}m`, goal: "" },
                    ]}
                  />
                </div>
                <div className="col-span-12 sm:col-span-5 space-y-3">
                  <RingLegend dot="from-rose-400 to-rose-600" label="Quests" value={`${completedRequired} / ${totalRequired}`} />
                  <RingLegend dot="from-blue-400 to-purple-500" label="XP" value={`${totalXpToday} / ${xpGoalToday}`} />
                  <RingLegend dot="from-amber-400 to-amber-600" label="Active" value={`${activeMinutes} / 120`} />
                  <div className="pt-3 border-t border-white/5">
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-slate-400 uppercase tracking-widest">Lv {player.level}</span>
                      <span className="text-blue-300 tabular-nums">
                        <CountUp to={player.xpInLevel} duration={900} /> / {player.xpToNext}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={false}
                        animate={{ width: `${Math.min(100, (player.xpInLevel / player.xpToNext) * 100)}%` }}
                        transition={{ type: "spring", stiffness: 80, damping: 22 }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_18px_rgba(59,130,246,0.6)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TiltCard>

          {/* Streak tile */}
          <TiltCard className="col-span-12 sm:col-span-6 lg:col-span-5 rounded-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 p-6 md:p-7 backdrop-blur-2xl h-full">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-orange-300">Streak</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-7xl text-white leading-none tabular-nums">
                      <CountUp to={player.streak} duration={1200} />
                    </span>
                    <span className="font-mono text-sm tracking-widest uppercase text-orange-200">days</span>
                  </div>
                </div>
                <div className="relative">
                  <Flame className="h-10 w-10 text-orange-300 animate-flame drop-shadow-[0_0_18px_rgba(251,146,60,0.8)]" strokeWidth={2} />
                </div>
              </div>

              {/* Heatmap last 30 days */}
              <div className="mt-6">
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">
                  Last 30 days
                </div>
                <div className="grid grid-cols-15 gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
                  {player.heat.map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.012, type: "spring", stiffness: 300, damping: 18 }}
                      className={cn(
                        "aspect-square rounded-sm",
                        h >= 1 ? "bg-emerald-500/80" : h > 0 ? "bg-amber-500/60" : "bg-white/5",
                      )}
                      style={{
                        boxShadow: h >= 1 ? "0 0 6px rgba(16,185,129,0.5)" : undefined,
                      }}
                      title={`${i + 1}d ago: ${h >= 1 ? "cleared" : h > 0 ? "partial" : "missed"}`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 text-xs text-slate-400">
                <span className="text-orange-300 font-semibold">{cleared ? player.streak + 1 : player.streak}</span>{" "}
                {cleared ? "days locked in. Don't break the chain." : "days strong. Clear today to extend."}
              </div>
            </div>
          </TiltCard>

          {/* Stat overview */}
          <TiltCard className="col-span-12 lg:col-span-7 rounded-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 p-6 md:p-7 backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
                    Stats
                  </div>
                  <div className="mt-1 text-lg font-semibold">Your build</div>
                </div>
                {activeStatFilter && (
                  <button
                    onClick={() => setActiveStatFilter(null)}
                    data-cursor="hover"
                    className="font-mono text-[10px] uppercase tracking-widest text-blue-300"
                  >
                    Clear filter ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {(Object.keys(STAT_META) as Stat[]).map((s, idx) => (
                  <StatTile
                    key={s}
                    stat={s}
                    value={player.stats[s]}
                    active={activeStatFilter === s}
                    onClick={() => setActiveStatFilter((p) => (p === s ? null : s))}
                    onHover={(h) => setHoveredStat(h ? s : null)}
                    delay={0.05 + idx * 0.06}
                  />
                ))}
              </div>
            </div>
          </TiltCard>

          {/* Compact info */}
          <TiltCard className="col-span-12 sm:col-span-6 lg:col-span-5 rounded-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 p-6 md:p-7 backdrop-blur-2xl h-full">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-purple-300">
                    Next milestone
                  </div>
                  <div className="mt-2 text-3xl font-bold tracking-tight text-white">
                    {nextTitle(player.level).name}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Lv {nextTitle(player.level).level} · {nextTitle(player.level).bonus}
                  </div>
                </div>
                <TrendingUp className="h-7 w-7 text-purple-300" strokeWidth={2} />
              </div>
              <div className="mt-6">
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">
                  <span>Progress</span>
                  <span className="text-purple-300 tabular-nums">
                    {player.level} / {nextTitle(player.level).level}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={false}
                    animate={{
                      width: `${Math.min(100, (player.level / nextTitle(player.level).level) * 100)}%`,
                    }}
                    transition={{ type: "spring", stiffness: 70, damping: 22 }}
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.5)]"
                  />
                </div>
              </div>
              <div className="mt-5 text-xs text-slate-400">
                {nextTitle(player.level).level - player.level} levels until promotion.
              </div>
            </div>
          </TiltCard>
        </div>

        {/* === Today's quests === */}
        <section className="mt-10">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
                Today
              </div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
                {activeStatFilter ? (
                  <>
                    <span className={STAT_META[activeStatFilter].tint}>{STAT_META[activeStatFilter].label}</span>{" "}
                    quests
                  </>
                ) : (
                  "Today's quests"
                )}
              </h2>
            </div>
            <div className="font-mono text-[11px] tabular-nums tracking-widest uppercase text-slate-400">
              {completedRequired} / {totalRequired} cleared
            </div>
          </div>

          <ul className="space-y-3" ref={completeQuestRef}>
            <AnimatePresence initial={false}>
              {visibleQuests.map((q, idx) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  index={idx}
                  onCheck={(e) => toggleCheckbox(q.id, e)}
                  onBump={(d, e) => bumpCount(q.id, d, e)}
                  onTimer={() => toggleTimer(q.id)}
                  onHover={(h) => setHoveredStat(h ? q.stat : null)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <p className="mt-10 text-center font-mono text-[10px] tracking-[0.3em] uppercase text-slate-600">
          Preview · Phase 2 wires this to Supabase
        </p>
      </div>
    </main>
  );
}

/* -------- helpers -------- */

function nextTitle(level: number) {
  if (level < 10) return { name: "Awakened", level: 10, bonus: "+5% XP" };
  if (level < 25) return { name: "Elite Hunter", level: 25, bonus: "+10% XP" };
  if (level < 50) return { name: "Necromancer", level: 50, bonus: "+15% XP" };
  if (level < 100) return { name: "Shadow Monarch", level: 100, bonus: "+20% XP" };
  return { name: "Maxed", level: 100, bonus: "+20% XP" };
}

function SectionTab({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-cursor="hover"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "relative flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors",
        active
          ? "border-white/30 bg-white/15 text-white"
          : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-200",
      )}
    >
      <span className="font-bold tracking-normal">{label}</span>
      <span className="text-slate-500 text-[9px]">·</span>
      <span className="text-slate-500">{sub}</span>
      {active && (
        <motion.span
          layoutId="active-tab-glow"
          className="absolute inset-0 rounded-full ring-2 ring-blue-400/60 shadow-[0_0_24px_rgba(59,130,246,0.4)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

function SceneSkeleton() {
  return (
    <div className="grid place-items-center rounded-3xl border border-white/10 bg-slate-900/40" style={{ height: 420 }}>
      <div className="text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />
        <div className="font-mono text-[10px] tracking-widest uppercase text-slate-500">Loading WebGL…</div>
      </div>
    </div>
  );
}

function Pill({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 backdrop-blur-sm">
      <span className="text-blue-300">{icon}</span>
      <div>
        <div className="font-bold text-sm leading-none">{label}</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-slate-400 leading-none mt-0.5">
          {sub}
        </div>
      </div>
    </div>
  );
}

function RingLegend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("h-3 w-3 rounded-full bg-gradient-to-br", dot)} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-widest uppercase text-slate-400">
          {label}
        </div>
        <div className="font-mono text-sm font-semibold text-white tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function LogoMark() {
  return (
    <div className="relative h-8 w-8">
      <svg viewBox="0 0 32 32" className="h-full w-full">
        <defs>
          <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <polygon
          points="16,3 28,10 28,22 16,29 4,22 4,10"
          fill="none"
          stroke="url(#logo-grad)"
          strokeWidth="2"
        />
        <circle cx="16" cy="16" r="3" fill="url(#logo-grad)" />
      </svg>
    </div>
  );
}

function StatTile({
  stat,
  value,
  active,
  onClick,
  onHover,
  delay,
}: {
  stat: Stat;
  value: number;
  active: boolean;
  onClick: () => void;
  onHover: (hovering: boolean) => void;
  delay: number;
}) {
  const meta = STAT_META[stat];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      data-cursor="hover"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "group flex flex-col items-center gap-1 rounded-2xl border bg-white/[0.04] p-3 backdrop-blur-sm transition-colors min-h-[100px]",
        active ? cn("ring-2", meta.ring, "border-transparent") : "border-white/10 hover:border-white/25",
      )}
      aria-pressed={active}
    >
      <span className="text-2xl leading-none">{meta.emoji}</span>
      <span className="font-display text-2xl text-white leading-none tabular-nums">{value}</span>
      <span className={cn("font-mono text-[9px] tracking-widest uppercase", meta.tint)}>{stat}</span>
    </motion.button>
  );
}

/* -------- Quest card -------- */

function QuestCard({
  quest,
  index,
  onCheck,
  onBump,
  onTimer,
  onHover,
}: {
  quest: Quest;
  index: number;
  onCheck: (e: React.MouseEvent) => void;
  onBump: (delta: number, e: React.MouseEvent) => void;
  onTimer: () => void;
  onHover: (hovering: boolean) => void;
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
  const running = quest.control.kind === "timer" && quest.control.running;

  return (
    <motion.li
      data-quest-card
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: done ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onTouchStart={() => onHover(true)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white/[0.03] px-4 py-4 backdrop-blur-sm transition-colors",
        done && "border-emerald-500/30 bg-emerald-950/15",
        !done && quest.penalty && "border-red-500/30 bg-red-950/20",
        !done && !quest.penalty && "border-white/10",
        running && "border-blue-500/40 animate-pulse-glow-blue",
      )}
    >
      <div className="flex items-center gap-4">
        {/* Emoji */}
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl",
            done ? "bg-emerald-500/15" : quest.penalty ? "bg-red-500/15" : "bg-white/5",
          )}
        >
          <span aria-hidden>{meta.emoji}</span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-[0.2em]",
              "border-white/10", meta.tint)}>
              {quest.stat}
            </span>
            {quest.penalty && (
              <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-red-300">
                PENALTY
              </span>
            )}
            {!quest.required && !quest.penalty && (
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-slate-400">
                OPTIONAL
              </span>
            )}
          </div>
          <div className={cn("mt-1 text-base sm:text-lg font-semibold leading-tight tracking-tight",
            done ? "text-slate-500 line-through" : "text-white")}>
            {quest.name}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-slate-500">
            <Sparkles className="h-3 w-3 text-blue-400" strokeWidth={2.5} />
            +{quest.baseXp} XP
            {quest.control.kind === "count" && (
              <span className="text-slate-500"> · target {quest.control.target}</span>
            )}
            {quest.control.kind === "timer" && (
              <span className="text-slate-500"> · {quest.control.targetMin} min</span>
            )}
          </div>
        </div>

        {/* Readout */}
        {quest.control.kind !== "checkbox" && (
          <div className="hidden sm:block min-w-[80px] text-right font-mono text-sm tabular-nums">
            {quest.control.kind === "count" && (
              <>
                <span className={done ? "text-emerald-300" : "text-white font-bold"}>
                  {quest.control.actual}
                </span>
                <span className="text-slate-600"> / {quest.control.target}</span>
              </>
            )}
            {quest.control.kind === "timer" && (
              <>
                <span className={done ? "text-emerald-300" : "text-white font-bold"}>
                  {fmtMmSs(quest.control.elapsedSec)}
                </span>
                <span className="text-slate-600"> / {String(quest.control.targetMin).padStart(2, "0")}:00</span>
              </>
            )}
          </div>
        )}

        {/* Control */}
        <div className="shrink-0">
          {quest.control.kind === "checkbox" && (
            <motion.button
              type="button"
              onClick={onCheck}
              whileTap={{ scale: 0.88 }}
              data-cursor="hover"
              aria-label={done ? "Mark incomplete" : "Mark done"}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-colors",
                done ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-white/15 bg-white/5 hover:border-blue-400 hover:bg-blue-500/10",
              )}
            >
              {done && <Check className="h-5 w-5" strokeWidth={3} />}
            </motion.button>
          )}

          {quest.control.kind === "count" && (
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                onClick={(e) => onBump(-1, e)}
                whileTap={{ scale: 0.88 }}
                data-cursor="hover"
                aria-label="Decrement"
                disabled={done}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 transition-colors hover:border-white/30 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </motion.button>
              <motion.button
                type="button"
                onClick={(e) => onBump(+1, e)}
                whileTap={{ scale: 0.88 }}
                data-cursor="hover"
                aria-label="Increment"
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-colors",
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
              data-cursor="hover"
              disabled={done}
              aria-label={running ? "Pause" : "Start"}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-colors disabled:opacity-40",
                running
                  ? "border-red-400/60 bg-red-500/15 text-red-300"
                  : done
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
              )}
            >
              {done ? <Check className="h-5 w-5" strokeWidth={3} /> : running ? <Pause className="h-5 w-5" strokeWidth={2.5} fill="currentColor" /> : <Play className="h-5 w-5 translate-x-px" strokeWidth={2.5} fill="currentColor" />}
            </motion.button>
          )}
        </div>
      </div>

      {/* Progress strip */}
      {quest.control.kind !== "checkbox" && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
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
      )}
    </motion.li>
  );
}

function fmtMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
