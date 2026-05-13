"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion, useScroll, useMotionValueEvent } from "motion/react";
import {
  Check,
  Play,
  Pause,
  Minus,
  Plus,
  Sparkles,
  Flame,
  RotateCcw,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import type { StatKind } from "@/lib/types";
import { StudioCursor } from "@/components/cursor";
import { ActivityRings, CountUp } from "@/components/animations/activity-rings";
import dynamic from "next/dynamic";

const HeroScene = dynamic(
  () => import("@/components/scene/hero-scene").then((m) => m.HeroScene),
  { ssr: false, loading: () => null },
);

/* -------- Types & seed -------- */

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

type SectionMode = "hero" | Stat | "summary";

const SECTION_ORDER: SectionMode[] = ["hero", "INT", "STR", "DIS", "summary"];

const STAT_META: Record<
  Stat,
  { label: string; bodyPart: string; emoji: string; tint: string; bar: string; ring: string; pageTint: string; description: string }
> = {
  INT: { label: "Intelligence", bodyPart: "Brain", emoji: "🧠", tint: "text-blue-300", bar: "from-blue-400 to-blue-600", ring: "ring-blue-500/40", pageTint: "rgba(59,130,246,0.16)", description: "Study, read, code. Mental work compounds into clarity." },
  STR: { label: "Strength", bodyPart: "Body", emoji: "💪", tint: "text-rose-300", bar: "from-rose-400 to-rose-600", ring: "ring-rose-500/40", pageTint: "rgba(244,63,94,0.16)", description: "Push, pull, run. Reps recalibrate the body." },
  DIS: { label: "Discipline", bodyPart: "Mind", emoji: "🕯", tint: "text-purple-300", bar: "from-purple-400 to-purple-600", ring: "ring-purple-500/40", pageTint: "rgba(168,85,247,0.16)", description: "Consistency. Showing up. Awareness of streak, of cycle, of self." },
};

const INITIAL_QUESTS: Quest[] = [
  { id: "q1", name: "Study", stat: "INT", baseXp: 75, required: true, control: { kind: "timer", elapsedSec: 0, targetMin: 90, running: false } },
  { id: "q2", name: "Read", stat: "INT", baseXp: 25, required: false, control: { kind: "timer", elapsedSec: 0, targetMin: 30, running: false } },
  { id: "q3", name: "Push-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q4", name: "Sit-ups", stat: "STR", baseXp: 50, required: true, control: { kind: "count", actual: 0, target: 100 } },
  { id: "q5", name: "Run (km)", stat: "STR", baseXp: 75, required: true, control: { kind: "count", actual: 0, target: 5 } },
  { id: "q6", name: "Squats (penalty +50%)", stat: "STR", baseXp: 75, required: true, penalty: true, control: { kind: "count", actual: 0, target: 150 } },
  { id: "q7", name: "Meditate", stat: "DIS", baseXp: 50, required: true, control: { kind: "timer", elapsedSec: 0, targetMin: 10, running: false } },
  { id: "q8", name: "No phone after 11pm", stat: "DIS", baseXp: 30, required: true, control: { kind: "checkbox", done: false } },
];

const INITIAL_PLAYER = {
  name: "Hassan",
  level: 14,
  title: "Awakened",
  xpInLevel: 420,
  xpToNext: 1000,
  streak: 23,
  stats: { INT: 51, STR: 42, DIS: 36 } as Record<Stat, number>,
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
  INT: ["#60a5fa", "#1d4ed8", "rgba(59,130,246,0.5)"],
  STR: ["#fb7185", "#e11d48", "rgba(244,63,94,0.5)"],
  DIS: ["#c084fc", "#7c3aed", "rgba(168,85,247,0.5)"],
};

/* -------- Page -------- */

export default function Dashboard() {
  const reduce = useReducedMotion();
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [player, setPlayer] = useState(INITIAL_PLAYER);
  const [hoveredStat, setHoveredStat] = useState<Stat | null>(null);
  const [burstStat, setBurstStat] = useState<Stat | null>(null);
  const [burstId, setBurstId] = useState(0);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [section, setSection] = useState<SectionMode>("hero");

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });

  // Map scroll progress to section
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(SECTION_ORDER.length - 1, Math.floor(v * SECTION_ORDER.length));
    const next = SECTION_ORDER[idx] ?? "hero";
    setSection((cur) => (cur === next ? cur : next));
  });

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
  const activeMinutes = useMemo(() => {
    let m = 0;
    quests.forEach((q) => {
      if (q.control.kind === "timer") m += Math.floor(q.control.elapsedSec / 60);
      if (q.control.kind === "count" && isQuestDone(q.control)) m += 5;
    });
    return m;
  }, [quests]);
  const xpGoalToday = 300;

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

  function celebrateAt(el: HTMLElement, colors: string[]) {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2 / window.innerWidth;
    const y = (r.top + r.bottom) / 2 / window.innerHeight;
    confetti({ particleCount: 60, spread: 65, startVelocity: 36, origin: { x, y }, colors, scalar: 0.9, ticks: 130 });
  }

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

  function resetDay() {
    setQuests(INITIAL_QUESTS);
    setPlayer(INITIAL_PLAYER);
  }

  function scrollToSection(s: SectionMode) {
    const el = document.getElementById(`sec-${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const sceneMode: "idle" | Stat = section === "hero" || section === "summary" ? "idle" : section;

  return (
    <main className="relative bg-slate-950 text-slate-100">
      <StudioCursor />
      <div aria-hidden className="grain" />

      {/* === Live 3D atmospheric background === */}
      <HeroScene
        mode={sceneMode}
        hoveredStat={hoveredStat}
        stats={player.stats}
        burstStat={burstStat}
        burstId={burstId}
        pulseTrigger={pulseTrigger}
        xpRatio={player.xpInLevel / player.xpToNext}
        streak={player.streak}
      />

      {/* === Fixed top bar === */}
      <header className="fixed top-0 inset-x-0 z-30 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 backdrop-blur-xl">
          <LogoMark />
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-300">
            Solo Leveling Life
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 backdrop-blur-xl font-mono text-[10px] tracking-widest uppercase text-slate-300">
            <Flame className="h-3 w-3 text-orange-300 animate-flame" />
            {player.streak}d
          </span>
          <span className="flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 backdrop-blur-xl font-mono text-[10px] tracking-widest uppercase text-slate-300">
            Lv {player.level}
          </span>
          <button
            onClick={resetDay}
            data-cursor="hover"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-300 hover:bg-white/10 transition-colors backdrop-blur-xl"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
            Reset
          </button>
        </div>
      </header>

      {/* === Fixed side scroll-nav (desktop) === */}
      <nav className="fixed left-6 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col gap-3">
        {SECTION_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => scrollToSection(s)}
            data-cursor="hover"
            className="group flex items-center gap-3"
            aria-label={`Scroll to ${s}`}
          >
            <span
              className={cn(
                "h-px transition-all duration-500",
                section === s ? "w-10 bg-white" : "w-5 bg-white/30 group-hover:w-7 group-hover:bg-white/60",
              )}
            />
            <span
              className={cn(
                "font-mono text-[9px] tracking-[0.4em] uppercase transition-colors",
                section === s ? "text-white" : "text-slate-600 group-hover:text-slate-300",
              )}
            >
              {s === "hero" ? "Start" : s === "summary" ? "Today" : STAT_META[s as Stat].label}
            </span>
          </button>
        ))}
      </nav>

      {/* === Page tint that follows the active section === */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1]"
        initial={false}
        animate={{
          backgroundColor:
            section === "hero" || section === "summary" ? "rgba(2,6,23,0)" : STAT_META[section as Stat].pageTint,
        }}
        transition={{ duration: 1 }}
        style={{ mixBlendMode: "screen" }}
      />

      {/* === Scroll container (sections) === */}
      <div ref={containerRef} className="relative z-10">
        {/* SECTION: HERO */}
        <Section id="hero">
          <div className="grid grid-cols-12 gap-6 items-center w-full">
            <div className="col-span-12 lg:col-span-8 lg:col-start-3 text-center">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="font-mono text-[11px] tracking-[0.5em] uppercase text-blue-300 mb-6"
              >
                Day {player.streak} · Lv {player.level} · {player.title}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="text-mega text-[clamp(64px,14vw,180px)] text-white"
              >
                Hello,<br />
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">
                  {player.name}.
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-6 text-slate-400 max-w-md mx-auto"
              >
                {cleared
                  ? "Day cleared. You earned your rest."
                  : `${remaining} quests left. Scroll through your body — clear them all.`}
              </motion.p>
              <motion.button
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 }}
                onClick={() => scrollToSection("INT")}
                data-cursor="hover"
                className="mx-auto mt-10 group flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                Begin
                <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-500 text-white transition-transform group-hover:translate-y-0.5">
                  <ChevronDown className="h-3 w-3" strokeWidth={3} />
                </span>
              </motion.button>
            </div>
          </div>
        </Section>

        {/* SECTION: INTELLECT (head/brain) */}
        <Section id="INT">
          <BodyPartSection
            stat="INT"
            value={player.stats.INT}
            quests={quests.filter((q) => q.stat === "INT")}
            onCheck={toggleCheckbox}
            onBump={bumpCount}
            onTimer={toggleTimer}
            onHover={setHoveredStat}
          />
        </Section>

        {/* SECTION: STRENGTH (body) */}
        <Section id="STR">
          <BodyPartSection
            stat="STR"
            value={player.stats.STR}
            quests={quests.filter((q) => q.stat === "STR")}
            onCheck={toggleCheckbox}
            onBump={bumpCount}
            onTimer={toggleTimer}
            onHover={setHoveredStat}
          />
        </Section>

        {/* SECTION: DISCIPLINE */}
        <Section id="DIS">
          <BodyPartSection
            stat="DIS"
            value={player.stats.DIS}
            quests={quests.filter((q) => q.stat === "DIS")}
            onCheck={toggleCheckbox}
            onBump={bumpCount}
            onTimer={toggleTimer}
            onHover={setHoveredStat}
          />
        </Section>

        {/* SECTION: SUMMARY */}
        <Section id="summary">
          <SummarySection
            player={player}
            completedRequired={completedRequired}
            totalRequired={totalRequired}
            totalXpToday={totalXpToday}
            xpGoalToday={xpGoalToday}
            activeMinutes={activeMinutes}
            cleared={cleared}
          />
        </Section>
      </div>
    </main>
  );
}

/* -------- Section wrapper -------- */

function Section({ id, children }: { id: SectionMode; children: React.ReactNode }) {
  return (
    <section
      id={`sec-${id}`}
      className="relative min-h-[100svh] flex items-center px-6 py-32 lg:px-20"
    >
      <div className="w-full max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

/* -------- Body-part section (used for 5 stats) -------- */

function BodyPartSection({
  stat,
  value,
  quests,
  onCheck,
  onBump,
  onTimer,
  onHover,
}: {
  stat: Stat;
  value: number;
  quests: Quest[];
  onCheck: (id: string, e?: React.MouseEvent) => void;
  onBump: (id: string, delta: number, e?: React.MouseEvent) => void;
  onTimer: (id: string) => void;
  onHover: (s: Stat | null) => void;
}) {
  const meta = STAT_META[stat];
  const sectionIndex = (["INT", "STR", "DIS"] as Stat[]).indexOf(stat) + 1;

  return (
    <div className="grid grid-cols-12 gap-6 items-center">
      <motion.div
        initial={{ opacity: 0, x: -32 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: false, margin: "-25%" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        onMouseEnter={() => onHover(stat)}
        onMouseLeave={() => onHover(null)}
        className="col-span-12 lg:col-span-7"
      >
        {/* Numbered eyebrow */}
        <div className="font-mono text-[11px] tracking-[0.5em] uppercase mb-4 flex items-center gap-3" style={{ color: STAT_HEX[stat][0] }}>
          <span className="tabular-nums">0{sectionIndex}</span>
          <span className="block h-px w-8 opacity-50" style={{ backgroundColor: STAT_HEX[stat][0] }} />
          <span>{meta.bodyPart}</span>
        </div>

        {/* Title */}
        <h2 className="text-mega text-[clamp(54px,11vw,160px)] text-white leading-[0.85]">
          {meta.label}.
        </h2>

        {/* Description */}
        <p className="mt-6 max-w-md text-slate-400 text-base leading-relaxed">
          {meta.description}
        </p>

        {/* Stat value + bar */}
        <div className="mt-8 max-w-md">
          <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">
            <span>{stat} score</span>
            <span style={{ color: STAT_HEX[stat][0] }} className="text-base font-bold tabular-nums">{value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${Math.min(100, (value / 60) * 100)}%` }}
              viewport={{ once: false }}
              transition={{ duration: 1.2, delay: 0.4 }}
              className={cn("h-full rounded-full bg-gradient-to-r", meta.bar)}
            />
          </div>
        </div>
      </motion.div>

      {/* Quests on the right */}
      <motion.div
        initial={{ opacity: 0, x: 32 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: false, margin: "-25%" }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="col-span-12 lg:col-span-5 space-y-3"
      >
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">
          {quests.length > 0 ? "Today's quests" : "No quests today"}
        </div>
        {quests.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-5 py-6 backdrop-blur-xl">
            <div className="text-2xl mb-1">{meta.emoji}</div>
            <p className="text-sm text-slate-300">
              You don&apos;t have any quests assigned to {meta.label} today.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Stat still grows passively from streak discipline.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {quests.map((q, idx) => (
            <QuestCard
              key={q.id}
              quest={q}
              index={idx}
              onCheck={(e) => onCheck(q.id, e)}
              onBump={(d, e) => onBump(q.id, d, e)}
              onTimer={() => onTimer(q.id)}
              onHover={(h) => onHover(h ? stat : null)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* -------- Summary section -------- */

function SummarySection({
  player,
  completedRequired,
  totalRequired,
  totalXpToday,
  xpGoalToday,
  activeMinutes,
  cleared,
}: {
  player: typeof INITIAL_PLAYER;
  completedRequired: number;
  totalRequired: number;
  totalXpToday: number;
  xpGoalToday: number;
  activeMinutes: number;
  cleared: boolean;
}) {
  return (
    <div className="grid grid-cols-12 gap-6 items-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, margin: "-25%" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="col-span-12 lg:col-span-6"
      >
        <div className="font-mono text-[11px] tracking-[0.5em] uppercase text-blue-300 mb-4">
          04 · Today
        </div>
        <h2 className="text-mega text-[clamp(48px,9vw,120px)] text-white leading-[0.9]">
          {cleared ? "Cleared." : "Progress."}
        </h2>
        <p className="mt-6 max-w-md text-slate-400">
          {cleared
            ? "All required quests done. The body has been recalibrated. Rest is earned."
            : `${totalRequired - completedRequired} of ${totalRequired} required quests still remain.`}
        </p>

        {/* Big stat row */}
        <div className="mt-10 grid grid-cols-3 gap-3">
          <BigStat label="XP today" value={<CountUp to={totalXpToday} duration={900} />} suffix="" />
          <BigStat label="Streak" value={<CountUp to={player.streak} duration={1100} />} suffix="d" />
          <BigStat label="Active" value={<CountUp to={activeMinutes} duration={900} />} suffix="m" />
        </div>

        {/* Heatmap */}
        <div className="mt-8">
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">
            Last 30 days
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
            {player.heat.map((h, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: false }}
                transition={{ delay: i * 0.012, type: "spring", stiffness: 280, damping: 18 }}
                className={cn(
                  "aspect-square rounded-sm",
                  h >= 1 ? "bg-emerald-500/80" : h > 0 ? "bg-amber-500/60" : "bg-white/5",
                )}
                style={{ boxShadow: h >= 1 ? "0 0 6px rgba(16,185,129,0.5)" : undefined }}
              />
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: false, margin: "-25%" }}
        transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="col-span-12 lg:col-span-6 flex justify-center"
      >
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-8 backdrop-blur-2xl">
          <ActivityRings
            size={300}
            centerLabel="Lv"
            centerValue={String(player.level)}
            rings={[
              { label: "Quests", progress: completedRequired / Math.max(1, totalRequired), gradient: ["#fb7185", "#e11d48"], glow: "rgba(244,63,94,0.6)", value: `${completedRequired}/${totalRequired}`, goal: "" },
              { label: "XP", progress: Math.min(1, totalXpToday / xpGoalToday), gradient: ["#60a5fa", "#7c3aed"], glow: "rgba(59,130,246,0.6)", value: `${totalXpToday}`, goal: "" },
              { label: "Active", progress: Math.min(1, activeMinutes / 120), gradient: ["#fbbf24", "#d97706"], glow: "rgba(251,191,36,0.6)", value: `${activeMinutes}m`, goal: "" },
            ]}
          />
        </div>
      </motion.div>
    </div>
  );
}

function BigStat({ label, value, suffix }: { label: string; value: React.ReactNode; suffix: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 backdrop-blur-xl">
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-display text-3xl text-white tabular-nums leading-none">
        {value}<span className="text-slate-500 text-lg">{suffix}</span>
      </div>
    </div>
  );
}

/* -------- Logo + quest card -------- */

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4">
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <polygon points="16,3 28,10 28,22 16,29 4,22 4,10" fill="none" stroke="url(#logo-grad)" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="url(#logo-grad)" />
    </svg>
  );
}

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
  onHover: (h: boolean) => void;
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
    <motion.div
      data-quest-card
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: done ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-4 backdrop-blur-xl transition-colors",
        done && "border-emerald-500/30 bg-emerald-950/30",
        !done && quest.penalty && "border-red-500/30 bg-red-950/30",
        !done && !quest.penalty && "border-white/10 bg-slate-950/55",
        running && "border-blue-500/40 animate-pulse-glow-blue",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl",
            done ? "bg-emerald-500/15" : quest.penalty ? "bg-red-500/15" : "bg-white/5",
          )}
        >
          <span aria-hidden>{meta.emoji}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {quest.penalty && (
              <span className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-red-300">
                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                PENALTY
              </span>
            )}
            {!quest.required && !quest.penalty && (
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest text-slate-400">
                OPTIONAL
              </span>
            )}
          </div>
          <div className={cn("mt-0.5 text-base font-semibold leading-tight tracking-tight", done ? "text-slate-500 line-through" : "text-white")}>
            {quest.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono tracking-widest uppercase text-slate-500">
            <Sparkles className="h-3 w-3 text-blue-400" strokeWidth={2.5} />
            +{quest.baseXp} XP
            {quest.control.kind === "count" && <span>· target {quest.control.target}</span>}
            {quest.control.kind === "timer" && <span>· {quest.control.targetMin} min</span>}
          </div>
        </div>

        <div className="shrink-0">
          {quest.control.kind === "checkbox" && (
            <motion.button
              type="button"
              onClick={onCheck}
              whileTap={{ scale: 0.88 }}
              data-cursor="hover"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors",
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
                disabled={done}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 hover:border-white/30 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </motion.button>
              <motion.button
                type="button"
                onClick={(e) => onBump(+1, e)}
                whileTap={{ scale: 0.88 }}
                data-cursor="hover"
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border-2",
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
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 disabled:opacity-40",
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

      {/* Readout + progress */}
      {quest.control.kind !== "checkbox" && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
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
          <div className="font-mono text-[10px] tabular-nums text-slate-400 min-w-[64px] text-right">
            {quest.control.kind === "count" && (
              <>
                <span className={done ? "text-emerald-300" : "text-white font-bold"}>{quest.control.actual}</span>
                <span className="text-slate-600"> / {quest.control.target}</span>
              </>
            )}
            {quest.control.kind === "timer" && (
              <>
                <span className={done ? "text-emerald-300" : "text-white font-bold"}>{fmtMmSs(quest.control.elapsedSec)}</span>
                <span className="text-slate-600"> / {String(quest.control.targetMin).padStart(2, "0")}:00</span>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function fmtMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
