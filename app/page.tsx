"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------
 * Types & seed data (replaced by Supabase queries in Phase 2)
 * ---------------------------------------------------------- */

type Stat = "STR" | "VIT" | "AGI" | "INT" | "PER";

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

const STAT_META: Record<Stat, { label: string; color: string; ring: string; bar: string }> = {
  STR: { label: "Strength", color: "text-rose-300", ring: "bg-rose-500/15 text-rose-300 border-rose-500/30", bar: "bg-rose-500" },
  VIT: { label: "Vitality", color: "text-emerald-300", ring: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", bar: "bg-emerald-500" },
  AGI: { label: "Agility", color: "text-amber-300", ring: "bg-amber-500/15 text-amber-300 border-amber-500/30", bar: "bg-amber-500" },
  INT: { label: "Intellect", color: "text-blue-300", ring: "bg-blue-500/15 text-blue-300 border-blue-500/30", bar: "bg-blue-500" },
  PER: { label: "Perception", color: "text-purple-300", ring: "bg-purple-500/15 text-purple-300 border-purple-500/30", bar: "bg-purple-500" },
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

const TITLE_FOR_LEVEL = (lv: number): string => {
  if (lv >= 100) return "Shadow Monarch";
  if (lv >= 50) return "Necromancer";
  if (lv >= 25) return "Elite Hunter";
  if (lv >= 10) return "Awakened";
  return "Novice";
};

const XP_TO_NEXT = (lv: number) => Math.ceil(100 * Math.pow(1.4, lv - 1));

function isQuestDone(c: Control): boolean {
  if (c.kind === "checkbox") return c.done;
  if (c.kind === "count") return c.actual >= c.target;
  return c.elapsedSec / 60 >= c.targetMin;
}

/* ----------------------------------------------------------
 * Page
 * ---------------------------------------------------------- */

export default function Home() {
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [player, setPlayer] = useState(INITIAL_PLAYER);
  const [xpFloaters, setXpFloaters] = useState<{ id: number; xp: number; x: number; y: number }[]>([]);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const floaterIdRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [clearedJustNow, setClearedJustNow] = useState(false);

  // Tick for running timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Apply timer progression every second
  useEffect(() => {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.control.kind !== "timer" || !q.control.running) return q;
        const newElapsed = q.control.elapsedSec + 1;
        const reachedTarget = newElapsed / 60 >= q.control.targetMin;
        if (reachedTarget) {
          // Stop timer and award XP
          fireXpGain(q.baseXp);
          return { ...q, control: { ...q.control, elapsedSec: q.control.targetMin * 60, running: false } };
        }
        return { ...q, control: { ...q.control, elapsedSec: newElapsed } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const remaining = useMemo(
    () => quests.filter((q) => q.required && !isQuestDone(q.control)).length,
    [quests],
  );
  const totalRequired = useMemo(() => quests.filter((q) => q.required).length, [quests]);
  const cleared = remaining === 0;

  // Cleared transition once
  useEffect(() => {
    if (cleared) {
      setClearedJustNow(true);
      const t = setTimeout(() => setClearedJustNow(false), 2200);
      return () => clearTimeout(t);
    }
  }, [cleared]);

  function fireXpGain(amount: number) {
    if (amount <= 0) return;
    const id = ++floaterIdRef.current;
    const x = 50 + Math.random() * 30 - 15;
    const y = 18;
    setXpFloaters((prev) => [...prev, { id, xp: amount, x, y }]);
    setTimeout(() => setXpFloaters((prev) => prev.filter((f) => f.id !== id)), 1300);

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
      if (leveled) setTimeout(() => setLevelUpVisible(true), 400);
      return { ...p, level, xpInLevel, xpToNext, title };
    });

    // haptic on mobile
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(20);
    }
  }

  function toggleCheckbox(id: string) {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id !== id || q.control.kind !== "checkbox") return q;
        const newDone = !q.control.done;
        if (newDone) fireXpGain(q.baseXp);
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
        if (!wasDone && nowDone) fireXpGain(q.baseXp);
        return { ...q, control: { ...q.control, actual } };
      }),
    );
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }
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

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      {/* Ambient radial glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_50%_-20%,rgba(59,130,246,0.18),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[300px] bg-[radial-gradient(circle_at_50%_120%,rgba(139,92,246,0.12),transparent_60%)]"
      />

      <div className="relative max-w-2xl mx-auto px-4 pt-6 pb-28 space-y-5">
        {/* Brand bar */}
        <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.4em] uppercase">
          <div className="flex items-center gap-2 text-blue-300/80">
            <Shield className="h-3 w-3" strokeWidth={2.5} />
            <span>System</span>
          </div>
          <button
            onClick={resetDay}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            Reset Preview
          </button>
        </div>

        {/* Player card */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950 p-5 backdrop-blur-sm">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/70 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono tracking-widest text-slate-500 mb-0.5">HUNTER</div>
              <h1 className="text-2xl font-bold tracking-tight">{player.name}</h1>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1">
                <Zap className="h-3.5 w-3.5 text-blue-300" strokeWidth={2.5} />
                <span className="font-mono text-sm font-semibold text-blue-200">Lv {player.level}</span>
              </div>
              <span className="text-xs font-mono text-slate-400">{player.title}</span>
            </div>
          </div>

          {/* XP bar */}
          <div className="mt-4 space-y-1.5">
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-slate-700/50">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-blue-400 to-purple-500 shadow-[0_0_20px_rgba(59,130,246,0.6)] transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (player.xpInLevel / player.xpToNext) * 100)}%` }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.5)_50%,transparent_100%)] animate-shimmer"
                />
              </div>
            </div>
            <div className="flex justify-between text-[11px] font-mono tabular-nums">
              <span className="text-slate-400">
                <span className="text-blue-300">{player.xpInLevel}</span>
                <span className="text-slate-600"> / {player.xpToNext} XP</span>
              </span>
              <div className="flex items-center gap-1.5 text-orange-300">
                <Flame className="h-3.5 w-3.5 animate-flame" strokeWidth={2.5} />
                <span className="font-semibold">{player.streak}-day streak</span>
              </div>
            </div>
          </div>

          {/* Floating XP gains */}
          <div className="pointer-events-none absolute inset-0">
            {xpFloaters.map((f) => (
              <div
                key={f.id}
                className="absolute font-mono text-sm font-bold text-blue-300 animate-float-up drop-shadow-[0_0_8px_rgba(59,130,246,0.7)]"
                style={{ left: `${f.x}%`, top: `${f.y}%` }}
              >
                +{f.xp} XP
              </div>
            ))}
          </div>
        </section>

        {/* Relax Gate */}
        <section
          className={cn(
            "relative overflow-hidden rounded-2xl border p-5 text-center transition-all duration-500",
            cleared
              ? "border-emerald-500/40 bg-gradient-to-b from-emerald-950/60 to-slate-950 shadow-[0_0_40px_rgba(16,185,129,0.18)]"
              : "border-red-500/30 bg-gradient-to-b from-red-950/40 to-slate-950 animate-pulse-glow-red",
            clearedJustNow && "animate-burst-in",
          )}
        >
          {cleared ? (
            <>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/40">
                <Check className="h-6 w-6 text-emerald-300" strokeWidth={3} />
              </div>
              <div className="font-mono text-xl font-bold tracking-[0.3em] text-emerald-300">CLEARED</div>
              <div className="mt-1 text-sm text-emerald-200/70">You may rest, Hunter.</div>
              <div className="mt-2 text-[11px] font-mono text-emerald-300/60">
                Cleared at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-2 ring-red-500/30">
                <Lock className="h-5 w-5 text-red-300" strokeWidth={2.5} />
              </div>
              <div className="font-mono text-xl font-bold tracking-[0.3em] text-red-300">LOCKED</div>
              <div className="mt-1 text-sm text-red-200/80">
                <span className="font-mono text-base font-semibold text-red-100">{remaining}</span>
                <span className="text-red-200/70"> of {totalRequired} quests remaining</span>
              </div>
              <div className="mt-2 text-[11px] font-mono uppercase tracking-widest text-red-300/70">
                Train, Hunter.
              </div>
            </>
          )}
        </section>

        {/* Today section */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
              Today’s Quests
            </h2>
            <span className="font-mono text-[10px] tabular-nums text-slate-500">
              {totalRequired - remaining} / {totalRequired}
            </span>
          </div>

          <ul className="space-y-2.5">
            {quests.map((q, idx) => (
              <QuestCard
                key={q.id}
                quest={q}
                index={idx}
                onCheck={() => toggleCheckbox(q.id)}
                onBump={(d) => bumpCount(q.id, d)}
                onTimer={() => toggleTimer(q.id)}
              />
            ))}
          </ul>
        </section>

        {/* Stats sheet */}
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-sm">
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Stats
          </h2>
          <div className="space-y-3">
            {(Object.keys(STAT_META) as Stat[]).map((s) => {
              const v = player.stats[s];
              return (
                <div key={s}>
                  <div className="flex items-baseline justify-between font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold tracking-widest", STAT_META[s].color)}>
                        {s}
                      </span>
                      <span className="text-xs text-slate-500">{STAT_META[s].label}</span>
                    </div>
                    <span className="font-bold tabular-nums text-slate-200">{v}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", STAT_META[s].bar)}
                      style={{ width: `${Math.min(100, (v / 60) * 100)}%`, opacity: 0.85 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer note */}
        <p className="text-center text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600 pt-2">
          Preview · Phase 2 wires this to Supabase
        </p>
      </div>

      {/* Level up overlay */}
      {levelUpVisible && (
        <LevelUpOverlay
          level={player.level}
          title={player.title}
          onClose={() => setLevelUpVisible(false)}
        />
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
 * Quest card
 * ---------------------------------------------------------- */

function QuestCard({
  quest,
  index,
  onCheck,
  onBump,
  onTimer,
}: {
  quest: Quest;
  index: number;
  onCheck: () => void;
  onBump: (delta: number) => void;
  onTimer: () => void;
}) {
  const stat = STAT_META[quest.stat];
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
    <li
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-slate-900/40 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 animate-fade-in-up",
        done && "border-emerald-500/30 bg-emerald-950/15",
        !done && quest.penalty && "border-red-500/30 bg-red-950/20",
        !done && !quest.penalty && "border-slate-800/80 hover:border-slate-700",
        isTimerRunning && "animate-pulse-glow-blue border-blue-500/40",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest",
                stat.ring,
              )}
            >
              {quest.stat}
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
          <div
            className={cn(
              "text-base font-semibold leading-tight",
              done ? "text-slate-500 line-through" : "text-slate-100",
            )}
          >
            {quest.name}
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-slate-500">
            {!done && (
              <>
                <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px text-blue-400" strokeWidth={2.5} />
                <span>{quest.baseXp} XP reward</span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {quest.control.kind === "checkbox" && (
            <button
              type="button"
              onClick={onCheck}
              aria-label={done ? "Mark incomplete" : "Mark done"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all duration-200 active:scale-90",
                done
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-700 bg-slate-800/60 hover:border-blue-400 hover:bg-blue-500/10",
              )}
            >
              {done && <Check className="h-5 w-5" strokeWidth={3} />}
            </button>
          )}

          {quest.control.kind === "count" && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onBump(-1)}
                aria-label="Decrement"
                disabled={done}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 transition active:scale-90 hover:border-slate-600 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => onBump(+1)}
                aria-label="Increment"
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border-2 font-mono text-sm font-bold transition-all duration-200 active:scale-90",
                  done
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
                )}
              >
                <Plus className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          )}

          {quest.control.kind === "timer" && (
            <button
              type="button"
              onClick={onTimer}
              disabled={done}
              aria-label={quest.control.running ? "Pause timer" : "Start timer"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all duration-200 active:scale-90 disabled:opacity-40",
                quest.control.running
                  ? "border-red-400/60 bg-red-500/15 text-red-300"
                  : done
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
              )}
            >
              {done ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : quest.control.running ? (
                <Pause className="h-5 w-5" strokeWidth={2.5} fill="currentColor" />
              ) : (
                <Play className="h-5 w-5 translate-x-px" strokeWidth={2.5} fill="currentColor" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress + value readout */}
      {quest.control.kind !== "checkbox" && (
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                done ? "bg-emerald-500" : quest.penalty ? "bg-red-500" : "bg-gradient-to-r from-blue-500 to-purple-500",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="font-mono text-[11px] tabular-nums text-slate-400 min-w-[64px] text-right">
            {quest.control.kind === "count" && (
              <>
                <span className={done ? "text-emerald-300" : "text-slate-200"}>
                  {quest.control.actual}
                </span>
                <span className="text-slate-600"> / {quest.control.target}</span>
              </>
            )}
            {quest.control.kind === "timer" && (
              <>
                <span className={done ? "text-emerald-300" : "text-slate-200"}>
                  {formatMmSs(quest.control.elapsedSec)}
                </span>
                <span className="text-slate-600">
                  {" "}
                  / {String(quest.control.targetMin).padStart(2, "0")}:00
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ----------------------------------------------------------
 * Bottom nav item
 * ---------------------------------------------------------- */

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
    <button
      type="button"
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors min-h-[44px] min-w-[44px]",
        active ? "text-blue-300" : "text-slate-500 hover:text-slate-300",
      )}
    >
      <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_rgba(59,130,246,0.7)]")} strokeWidth={2.25} />
      <span>{label}</span>
    </button>
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
      <div className="animate-burst-in mx-4 max-w-sm rounded-2xl border-2 border-blue-500/60 bg-gradient-to-b from-blue-950/90 to-slate-950 p-8 text-center shadow-[0_0_80px_rgba(59,130,246,0.4)]">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20 ring-2 ring-blue-400/60">
          <Zap className="h-7 w-7 text-blue-300" strokeWidth={2.5} fill="currentColor" />
        </div>
        <div className="font-mono text-xs tracking-[0.4em] text-blue-300/80">LEVEL UP</div>
        <div className="mt-2 text-4xl font-extrabold tracking-tight text-white">Lv {level}</div>
        <div className="mt-1 font-mono text-sm text-blue-200">{title}</div>
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 font-mono text-xs text-blue-100">
          +5 stat points to allocate
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 font-semibold text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] active:scale-95 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
