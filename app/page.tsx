"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useScroll,
  useTransform,
  useSpring,
} from "motion/react";
import {
  Check,
  Play,
  Pause,
  Minus,
  Plus,
  Lock,
  Sparkles,
  Flame,
  ArrowDown,
  Zap,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatKind } from "@/lib/types";
import { HunterFigure, type ZoomTarget } from "@/components/animations/hunter-figure";
import { StudioCursor } from "@/components/cursor";
import { Marquee } from "@/components/marquee";

/* ----------------------------------------------------------
 * Types & seed data — replaced by Supabase in Phase 2
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
  { label: string; bodyPart: string; tag: string; text: string; chip: string; bar: string; ring: string }
> = {
  STR: { label: "Strength", bodyPart: "Chest", tag: "Iron", text: "text-rose-300", chip: "bg-rose-500/15 text-rose-300 border-rose-500/30", bar: "from-rose-400 to-rose-600", ring: "ring-rose-500/40" },
  VIT: { label: "Vitality", bodyPart: "Heart", tag: "Pulse", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", bar: "from-emerald-400 to-emerald-600", ring: "ring-emerald-500/40" },
  AGI: { label: "Agility", bodyPart: "Legs", tag: "Flow", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30", bar: "from-amber-400 to-amber-600", ring: "ring-amber-500/40" },
  INT: { label: "Intellect", bodyPart: "Brain", tag: "Mind", text: "text-blue-300", chip: "bg-blue-500/15 text-blue-300 border-blue-500/30", bar: "from-blue-400 to-blue-600", ring: "ring-blue-500/40" },
  PER: { label: "Perception", bodyPart: "Eyes", tag: "Sight", text: "text-purple-300", chip: "bg-purple-500/15 text-purple-300 border-purple-500/30", bar: "from-purple-400 to-purple-600", ring: "ring-purple-500/40" },
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

  // Scroll-driven parallax for the hero
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroTitleY = useSpring(useTransform(heroProgress, [0, 1], [0, -120]), { stiffness: 50, damping: 20 });
  const heroFigureScale = useSpring(useTransform(heroProgress, [0, 1], [1, 1.1]), { stiffness: 60, damping: 22 });
  const heroOpacity = useTransform(heroProgress, [0, 0.7], [1, 0.2]);

  return (
    <main className="relative bg-slate-950 text-slate-100">
      <StudioCursor />
      {/* Grain */}
      <div aria-hidden className="grain" />

      {/* Global background mesh */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.16),transparent_55%)]" />
        <div className="absolute inset-0 animate-mesh-drift bg-[radial-gradient(ellipse_25%_25%_at_20%_40%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(ellipse_25%_25%_at_80%_75%,rgba(59,130,246,0.16),transparent_60%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[300px] bg-[radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.12),transparent_60%)]" />
      </div>

      {/* Top nav */}
      <header className="fixed top-0 inset-x-0 z-40 px-6 py-5 flex items-center justify-between mix-blend-difference">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.4em] text-white">
          <Logo />
          <span>SYSTEM ⁄ HUNTER PROTOCOL</span>
        </div>
        <button
          onClick={resetDay}
          className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.4em] uppercase text-white"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
          Reset
        </button>
      </header>

      {/* ============= HERO ============= */}
      <section
        ref={heroRef}
        className="relative z-10 min-h-screen px-6 pt-28 pb-12 grid grid-cols-12 gap-4 items-center"
      >
        {/* Vertical side label */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 hidden lg:block">
          <div className="rotate-180 [writing-mode:vertical-rl] font-mono text-[10px] tracking-[0.5em] text-slate-500">
            DAILY · DESCENT · {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:block">
          <div className="[writing-mode:vertical-rl] font-mono text-[10px] tracking-[0.5em] text-slate-500">
            E·RANK ↦ MONARCH
          </div>
        </div>

        <motion.div style={{ y: heroTitleY, opacity: heroOpacity }} className="col-span-12 md:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-mono text-[11px] tracking-[0.4em] text-blue-300 mb-5"
          >
            ⟶ DAY {player.streak} · LV {player.level} · {player.title.toUpperCase()}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="text-mega text-[clamp(64px,14vw,220px)] text-white"
          >
            Train.<br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">
              Hunter.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="mt-6 max-w-md text-base text-slate-400 leading-relaxed"
          >
            The System has assigned you {totalRequired} quests today. Clear them all to earn your rest.
            Discipline compounds. The body recalibrates. Level up.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-10 flex items-center gap-4"
          >
            <a
              href="#today"
              className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              Begin Descent
              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-500 text-white transition-transform group-hover:translate-y-0.5">
                <ArrowDown className="h-3 w-3" strokeWidth={3} />
              </span>
            </a>
            <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-slate-500">
              Scroll
            </span>
          </motion.div>
        </motion.div>

        {/* Hunter figure */}
        <motion.div
          style={{ scale: heroFigureScale, opacity: heroOpacity }}
          className="col-span-12 md:col-span-5 relative"
        >
          <div className="relative mx-auto max-w-xs md:max-w-none">
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
                    className="absolute font-display text-3xl text-blue-300 drop-shadow-[0_0_18px_rgba(59,130,246,0.95)]"
                    style={{ left: `${f.x}%`, top: `${f.y}%` }}
                  >
                    +{f.xp} XP
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Stat pins under figure */}
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {(Object.keys(STAT_META) as Stat[]).map((s, idx) => (
              <StatPin
                key={s}
                stat={s}
                value={player.stats[s]}
                active={zoom === s}
                onClick={() => setActiveStatFilter((prev) => (prev === s ? null : s))}
                delay={0.5 + idx * 0.06}
                reduce={reduce ?? false}
              />
            ))}
          </div>
        </motion.div>
      </section>

      {/* ============= MARQUEE DIVIDER ============= */}
      <section className="relative z-10 py-6 border-y border-white/5 bg-slate-950/40 backdrop-blur-sm">
        <Marquee
          speed="normal"
          items={[
            <BigMarqueeItem key="1" text={`Lv ${player.level}`} sub={player.title} />,
            <BigMarqueeItem key="2" text="100 / 100" sub="Push-ups" />,
            <BigMarqueeItem key="3" text="90 min" sub="Study" />,
            <BigMarqueeItem key="4" text={`🜂 ${player.streak}`} sub="Streak" />,
            <BigMarqueeItem key="5" text="STR · VIT · AGI · INT · PER" sub="Five Pillars" />,
            <BigMarqueeItem key="6" text="The body recalibrates" sub="Daily" />,
          ]}
        />
      </section>

      {/* ============= XP & PLAYER STATUS ============= */}
      <section className="relative z-10 px-6 py-16 md:py-24">
        <Reveal>
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 md:col-span-7">
              <SectionEyebrow>01 · Status</SectionEyebrow>
              <h2 className="text-mega text-[clamp(40px,7vw,90px)] text-white mt-3">
                Experience<br />
                <span className="text-slate-500">Compounds.</span>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 space-y-4">
              <div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-widest text-slate-400">
                <span>XP to next</span>
                <span className="tabular-nums">
                  <span className="text-blue-300">{player.xpInLevel}</span>
                  <span className="text-slate-700"> / {player.xpToNext}</span>
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.min(100, (player.xpInLevel / player.xpToNext) * 100)}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-blue-400 to-purple-500 shadow-[0_0_22px_rgba(59,130,246,0.7)]"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] animate-shimmer" />
                </motion.div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-4">
                <Stat kv="Level" v={player.level} />
                <Stat kv="Streak" v={player.streak} suffix="d" />
                <Stat kv="Cleared" v={`${totalRequired - remaining}/${totalRequired}`} />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============= RELAX GATE ============= */}
      <section className="relative z-10 px-6 py-12">
        <Reveal>
          <SectionEyebrow>02 · Gate</SectionEyebrow>
          <div className="mt-4">
            <AnimatePresence mode="wait">
              {cleared ? <ClearedGate key="cleared" /> : <LockedGate key="locked" remaining={remaining} total={totalRequired} />}
            </AnimatePresence>
          </div>
        </Reveal>
      </section>

      {/* ============= TODAY ============= */}
      <section id="today" className="relative z-10 px-6 py-16 md:py-24">
        <Reveal>
          <SectionEyebrow>03 · Today</SectionEyebrow>
          <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
            <h2 className="text-mega text-[clamp(40px,7vw,90px)] text-white">
              Today’s<br />
              <span className="text-slate-500">Descent.</span>
            </h2>
            <div className="font-mono text-xs uppercase tracking-widest text-slate-400">
              {activeStatFilter ? (
                <button
                  onClick={() => setActiveStatFilter(null)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-white"
                >
                  Filter · {STAT_META[activeStatFilter].label} ×
                </button>
              ) : (
                <span>
                  {totalRequired - remaining} / {totalRequired} cleared
                </span>
              )}
            </div>
          </div>
        </Reveal>

        <ul className="mt-10 space-y-3">
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

      {/* ============= MANIFESTO ============= */}
      <section className="relative z-10 px-6 py-24 md:py-32 border-y border-white/5">
        <Reveal>
          <SectionEyebrow>04 · The System</SectionEyebrow>
          <p className="mt-6 text-mega text-[clamp(40px,8vw,110px)] text-white leading-[0.95]">
            The body<br />
            <span className="text-slate-500">recalibrates.</span><br />
            Every<br />
            rep.<br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Forever.</span>
          </p>
        </Reveal>
      </section>

      {/* ============= MARQUEE FOOTER ============= */}
      <section className="relative z-10 py-6 border-y border-white/5 bg-slate-950/40 backdrop-blur-sm">
        <Marquee
          reverse
          items={[
            <BigMarqueeItem key="a" text="Awaken" sub="Lv 10" />,
            <BigMarqueeItem key="b" text="Elite Hunter" sub="Lv 25" />,
            <BigMarqueeItem key="c" text="Necromancer" sub="Lv 50" />,
            <BigMarqueeItem key="d" text="Shadow Monarch" sub="Lv 100" />,
          ]}
        />
      </section>

      {/* ============= FOOTER ============= */}
      <footer className="relative z-10 px-6 py-12 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-mega text-5xl text-white">SOLO LEVELING LIFE</div>
          <div className="font-mono text-[10px] tracking-[0.5em] text-slate-500 mt-2">
            v0.1 · STATIC PREVIEW
          </div>
        </div>
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-slate-500 max-w-xs text-right">
          Built by the Player. Phase 2 wires this to Supabase.
        </div>
      </footer>

      <AnimatePresence>
        {levelUpVisible && (
          <LevelUpOverlay
            level={player.level}
            title={player.title}
            onClose={() => setLevelUpVisible(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

/* ----------------------------------------------------------
 * Small presentational pieces
 * ---------------------------------------------------------- */

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.5em] uppercase text-blue-300">
      <span className="inline-block h-px w-6 align-middle bg-blue-400/60 mr-2" />
      {children}
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <polygon
        points="12,2 22,8 22,16 12,22 2,16 2,8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function BigMarqueeItem({ text, sub }: { text: string; sub: string }) {
  return (
    <span className="flex items-baseline gap-3">
      <span className="text-mega text-[clamp(36px,6vw,80px)] text-white whitespace-nowrap">{text}</span>
      <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-slate-500">{sub}</span>
    </span>
  );
}

function Stat({ kv, v, suffix }: { kv: string; v: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 backdrop-blur-sm">
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-500">{kv}</div>
      <div className="font-display text-2xl text-white leading-none mt-1">
        {v}
        {suffix && <span className="text-slate-500 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * Stat zoom pin
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
      whileHover={reduce ? undefined : { scale: 1.06, y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      className={cn(
        "group flex flex-col items-center gap-0.5 rounded-xl border bg-white/[0.04] p-2 backdrop-blur-sm transition-colors",
        active ? cn("ring-2 ring-offset-2 ring-offset-slate-950", meta.ring, "border-transparent") : "border-white/10 hover:border-white/25",
      )}
      aria-pressed={active}
      data-cursor="hover"
    >
      <div className={cn("font-mono text-[9px] font-bold tracking-[0.2em]", meta.text)}>{stat}</div>
      <div className="font-display text-2xl text-white tabular-nums leading-none">{value}</div>
      <div className="font-mono text-[8px] tracking-[0.3em] text-slate-500 uppercase">{meta.bodyPart}</div>
    </motion.button>
  );
}

/* ----------------------------------------------------------
 * Relax Gate
 * ---------------------------------------------------------- */

function LockedGate({ remaining, total }: { remaining: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/40 to-slate-950 p-8 md:p-12 animate-pulse-glow-red"
    >
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #ef4444 0 10px, transparent 10px 22px)" }} />
      <div className="relative grid grid-cols-12 gap-6 items-center">
        <div className="col-span-12 md:col-span-7">
          <div className="font-mono text-[10px] tracking-[0.5em] uppercase text-red-300">Status</div>
          <div className="text-mega text-[clamp(80px,14vw,180px)] text-red-300 mt-2">
            Locked.
          </div>
        </div>
        <div className="col-span-12 md:col-span-5 space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-7xl text-white tabular-nums">{remaining}</span>
            <span className="font-mono text-xs tracking-widest uppercase text-red-200/80">
              of {total} quests remain
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 w-fit">
            <Lock className="h-3.5 w-3.5 text-red-300" strokeWidth={2.5} />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-red-200">
              Train, Hunter
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ClearedGate() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/50 to-slate-950 p-8 md:p-12 shadow-[0_0_80px_rgba(16,185,129,0.25)]"
    >
      <div className="absolute inset-0">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: [0, 0.5, 0], scaleY: [0, 1, 1] }}
            transition={{ duration: 1.4, delay: i * 0.04 }}
            className="absolute left-1/2 top-1/2 h-48 w-px origin-bottom -translate-x-1/2 bg-emerald-400/60"
            style={{ transform: `translate(-50%, -100%) rotate(${i * 30}deg)` }}
          />
        ))}
      </div>
      <div className="relative grid grid-cols-12 gap-6 items-center">
        <div className="col-span-12 md:col-span-7">
          <div className="font-mono text-[10px] tracking-[0.5em] uppercase text-emerald-300">Status</div>
          <div className="text-mega text-[clamp(80px,14vw,180px)] text-emerald-300 mt-2">
            Cleared.
          </div>
        </div>
        <div className="col-span-12 md:col-span-5">
          <div className="text-base text-emerald-200/80">You may rest, Hunter.</div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.3em] uppercase text-emerald-300/60">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: done ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={onHover}
      onTouchStart={onHover}
      className={cn(
        "group relative overflow-hidden rounded-3xl border bg-white/[0.03] px-6 py-5 backdrop-blur-md transition-colors",
        done && "border-emerald-500/30 bg-emerald-950/15",
        !done && quest.penalty && "border-red-500/30 bg-red-950/20",
        !done && !quest.penalty && (zoomedOn ? cn("ring-2", meta.ring, "border-transparent") : "border-white/10"),
        isTimerRunning && "animate-pulse-glow-blue border-blue-500/40",
      )}
    >
      {/* Big number on the left */}
      <div className="grid grid-cols-12 gap-4 items-center">
        <div className="col-span-2 md:col-span-1">
          <span className="font-display text-3xl md:text-5xl text-slate-700 tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div className="col-span-10 md:col-span-7 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
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
          <div className={cn("font-display text-3xl md:text-4xl leading-none tracking-tight", done ? "text-slate-500 line-through" : "text-white")}>
            {quest.name}
          </div>
          {!done && (
            <div className="mt-1.5 text-[11px] font-mono tracking-widest uppercase text-slate-500">
              <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px text-blue-400" strokeWidth={2.5} />
              {quest.baseXp} XP reward
            </div>
          )}
        </div>

        <div className="col-span-12 md:col-span-4 flex items-center justify-end gap-3">
          {/* Readout */}
          {quest.control.kind !== "checkbox" && (
            <div className="font-mono text-sm tabular-nums text-slate-300 min-w-[80px] text-right">
              {quest.control.kind === "count" && (
                <>
                  <span className={done ? "text-emerald-300" : "text-white font-bold"}>{quest.control.actual}</span>
                  <span className="text-slate-600"> / {quest.control.target}</span>
                </>
              )}
              {quest.control.kind === "timer" && (
                <>
                  <span className={done ? "text-emerald-300" : "text-white font-bold"}>{formatMmSs(quest.control.elapsedSec)}</span>
                  <span className="text-slate-600"> / {String(quest.control.targetMin).padStart(2, "0")}:00</span>
                </>
              )}
            </div>
          )}

          {/* Control */}
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
                onClick={() => onBump(-1)}
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
                onClick={() => onBump(+1)}
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
              aria-label={quest.control.running ? "Pause timer" : "Start timer"}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-colors disabled:opacity-40",
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

      {/* Progress bar */}
      {quest.control.kind !== "checkbox" && (
        <div className="mt-4 h-px overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
            className={cn(
              "h-full rounded-full",
              done ? "bg-emerald-500" : quest.penalty ? "bg-gradient-to-r from-red-400 to-red-600" : "bg-gradient-to-r from-blue-500 to-purple-500",
            )}
            style={{ height: "2px" }}
          />
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

/* ----------------------------------------------------------
 * Level up overlay
 * ---------------------------------------------------------- */

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.6, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="relative max-w-md w-full text-center"
      >
        <div className="font-mono text-xs tracking-[0.6em] text-blue-300/80">LEVEL UP</div>
        <div className="text-mega text-[160px] text-white leading-none mt-2">Lv {level}</div>
        <div className="font-mono text-sm tracking-[0.4em] uppercase text-blue-200 mt-2">{title}</div>
        <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 font-mono text-xs text-blue-100">
          <Sparkles className="h-3 w-3" />
          +5 stat points
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          data-cursor="hover"
          className="block mx-auto mt-8 rounded-full border border-white/20 bg-white/5 px-8 py-3 font-mono text-xs tracking-[0.4em] uppercase text-white backdrop-blur transition-colors hover:bg-white/10"
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
