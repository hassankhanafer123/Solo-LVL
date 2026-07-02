"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  Play,
  Pause,
  Minus,
  Plus,
  Trophy,
  CalendarDays,
  ListChecks,
  CalendarRange,
  BarChart3,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatKind } from "@/lib/types";
import type { TrackerSnapshot, TrackerQuest } from "@/lib/tracker/types";
import { useTracker } from "@/hooks/use-tracker";
import { useIsDemo } from '@/lib/demo/context';
import { PlanEditor } from "@/components/tracker/plan-editor";

type Stat = StatKind;
type Tab = "today" | "week" | "stats";

/* Category accent palette — consistent with the desktop STAT_META hexes. */
const STAT_ACCENT: Record<Stat, { dot: string; text: string; bar: string; ring: string }> = {
  INT: { dot: "bg-blue-500", text: "text-blue-300", bar: "from-blue-400 to-blue-600", ring: "ring-blue-500/40" },
  STR: { dot: "bg-rose-500", text: "text-rose-300", bar: "from-rose-400 to-rose-600", ring: "ring-rose-500/40" },
  DIS: { dot: "bg-purple-500", text: "text-purple-300", bar: "from-purple-400 to-purple-600", ring: "ring-purple-500/40" },
};

const STAT_LABEL: Record<Stat, string> = {
  INT: "Intelligence",
  STR: "Strength",
  DIS: "Discipline",
};

function vibrate(ms: number) {
  if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
}

function fmtMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MobileApp({ snapshot }: { snapshot: TrackerSnapshot }) {
  const tracker = useTracker(snapshot);
  const lbHref = useIsDemo() ? '/demo/leaderboard' : '/leaderboard';
  const profile = tracker.snapshot.profile;
  const weekStart = tracker.snapshot.weekStart;
  const username = profile.username ?? profile.displayName;

  const [tab, setTab] = useState<Tab>("today");
  const [planOpen, setPlanOpen] = useState(false);

  const pct = Math.max(0, Math.min(1, tracker.snapshot.weeklyCompletionPct));
  const pctLabel = Math.round(pct * 100);

  return (
    <div className="min-h-[100svh] bg-slate-950 text-slate-100">
      {/* === Sticky header === */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight text-white">
              Hi, {username}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                Lv {profile.level}
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-300" />
                {profile.streakCurrent}d
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={lbHref}
              aria-label="Leaderboard"
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
            >
              <Trophy className="h-5 w-5" strokeWidth={2.25} />
            </Link>
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              Edit tasks
            </button>
          </div>
        </div>

        {/* Weekly progress toward the 85% level gate */}
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500 transition-all duration-500"
              style={{ width: `${pctLabel}%` }}
            />
          </div>
          <div className="mt-1.5 font-mono text-[10px] tracking-wide text-slate-400">
            {pctLabel}% this week · 85% to level
          </div>
        </div>
      </header>

      {/* === Main scroll area === */}
      <main className="px-4 pb-28 pt-4">
        {tab === "today" && (
          <TodayTab quests={tracker.snapshot.dailyQuests} tracker={tracker} />
        )}
        {tab === "week" && (
          <WeekTab
            quests={tracker.snapshot.weeklyQuests}
            tracker={tracker}
            onEdit={() => setPlanOpen(true)}
          />
        )}
        {tab === "stats" && <StatsTab snapshot={tracker.snapshot} />}
      </main>

      {/* === Bottom tab bar === */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          <TabButton active={tab === "today"} onClick={() => setTab("today")} icon={<ListChecks className="h-5 w-5" />} label="Today" />
          <TabButton active={tab === "week"} onClick={() => setTab("week")} icon={<CalendarRange className="h-5 w-5" />} label="Week" />
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon={<BarChart3 className="h-5 w-5" />} label="Stats" />
        </div>
      </nav>

      {/* === Plan editor modal (shared with desktop) === */}
      <PlanEditor
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        tasks={[...tracker.snapshot.dailyQuests, ...tracker.snapshot.weeklyQuests]}
        weekStart={weekStart}
        onSave={tracker.planWeek}
      />
    </div>
  );
}

type Tracker = ReturnType<typeof useTracker>;

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold tracking-wide transition-colors",
        active ? "text-white" : "text-slate-500",
      )}
    >
      <span className={cn("transition-transform", active && "scale-110")}>{icon}</span>
      {label}
    </button>
  );
}

/* -------- Today tab -------- */

function TodayTab({ quests, tracker }: { quests: TrackerQuest[]; tracker: Tracker }) {
  if (quests.length === 0) {
    return <EmptyState icon={<CalendarDays className="h-6 w-6" />} message="No daily quests yet. Tap “Edit tasks” to plan your week." />;
  }
  return (
    <div className="space-y-3">
      <SectionLabel>Today&apos;s quests</SectionLabel>
      {quests.map((q) => (
        <DailyQuestCard key={q.instanceId} quest={q} tracker={tracker} />
      ))}
    </div>
  );
}

function DailyQuestCard({ quest, tracker }: { quest: TrackerQuest; tracker: Tracker }) {
  if (quest.completionType === "checkbox") {
    return <CheckboxCard quest={quest} tracker={tracker} />;
  }
  if (quest.completionType === "timer") {
    return <TimerCard quest={quest} tracker={tracker} />;
  }
  return <CountCard quest={quest} tracker={tracker} cadence="daily" />;
}

function QuestShell({
  quest,
  done,
  children,
}: {
  quest: TrackerQuest;
  done: boolean;
  children: React.ReactNode;
}) {
  const accent = STAT_ACCENT[quest.stat];
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5 transition-colors",
        done ? "border-emerald-500/40 bg-emerald-950/25" : "border-white/10 bg-slate-900/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", done ? "bg-emerald-400" : accent.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className={cn("text-[15px] font-semibold leading-tight", done ? "text-slate-400 line-through" : "text-white")}>
            {quest.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <span className={accent.text}>+{quest.baseXp}</span>
            <span>{STAT_LABEL[quest.stat]}</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function CheckboxCard({ quest, tracker }: { quest: TrackerQuest; tracker: Tracker }) {
  const done = quest.completed;
  function toggle() {
    if (done) {
      tracker.uncomplete(quest.instanceId);
    } else {
      tracker.complete(quest.instanceId);
      vibrate(20);
    }
  }
  return (
    <QuestShell quest={quest} done={done}>
      <button
        type="button"
        onClick={toggle}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 transition-colors",
          done ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-white/15 bg-white/5 text-transparent hover:border-blue-400",
        )}
      >
        <Check className="h-5 w-5" strokeWidth={3} />
      </button>
    </QuestShell>
  );
}

function CountCard({
  quest,
  tracker,
  cadence,
}: {
  quest: TrackerQuest;
  tracker: Tracker;
  cadence: "daily" | "weekly";
}) {
  const target = quest.targetValue ?? 0;
  const actual = quest.actualValue;
  const done = target > 0 ? actual >= target : quest.completed;

  function bump(delta: number) {
    const next = Math.max(0, actual + delta);
    if (cadence === "weekly") tracker.setWeekly(quest.instanceId, next);
    else tracker.setProgress(quest.instanceId, next);
    vibrate(6);
  }

  return (
    <QuestShell quest={quest} done={done}>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={actual === 0}
          aria-label="Decrease"
          className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/5 text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30"
        >
          <Minus className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <div className="min-w-[52px] text-center font-mono text-sm tabular-nums">
          <span className={done ? "text-emerald-300 font-bold" : "text-white font-bold"}>{actual}</span>
          <span className="text-slate-600"> / {target}</span>
        </div>
        <button
          type="button"
          onClick={() => bump(1)}
          aria-label="Increase"
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl border-2 transition-colors",
            done ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>
    </QuestShell>
  );
}

function TimerCard({ quest, tracker }: { quest: TrackerQuest; tracker: Tracker }) {
  const targetMin = quest.targetValue ?? 0;
  const persistedSec = quest.actualValue * 60;
  const done = targetMin > 0 ? quest.actualValue >= targetMin : quest.completed;

  const [running, setRunning] = useState(false);
  const [localSec, setLocalSec] = useState(persistedSec);

  // Keep local display in sync when persisted value changes and we're idle.
  useEffect(() => {
    if (!running) setLocalSec(quest.actualValue * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.actualValue]);

  // Tick while running; auto-complete and persist once on reaching target.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLocalSec((s) => {
        const next = s + 1;
        if (targetMin > 0 && next / 60 >= targetMin) {
          setRunning(false);
          tracker.setProgress(quest.instanceId, targetMin);
          vibrate(20);
          return targetMin * 60;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, targetMin]);

  function toggle() {
    if (running) {
      // Pause: persist whole minutes elapsed.
      setRunning(false);
      tracker.setProgress(quest.instanceId, Math.floor(localSec / 60));
    } else {
      setRunning(true);
    }
  }

  return (
    <QuestShell quest={quest} done={done}>
      <div className="flex shrink-0 items-center gap-2">
        <div className="min-w-[68px] text-right font-mono text-sm tabular-nums">
          <span className={done ? "text-emerald-300 font-bold" : "text-white font-bold"}>{fmtMmSs(localSec)}</span>
          <span className="block text-[10px] text-slate-600">/ {String(targetMin).padStart(2, "0")}:00</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={done}
          aria-label={done ? "Done" : running ? "Pause timer" : "Start timer"}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl border-2 transition-colors disabled:opacity-50",
            done
              ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
              : running
                ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
                : "border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25",
          )}
        >
          {done ? <Check className="h-5 w-5" strokeWidth={3} /> : running ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5 translate-x-px" fill="currentColor" />}
        </button>
      </div>
    </QuestShell>
  );
}

/* -------- Week tab -------- */

function WeekTab({
  quests,
  tracker,
  onEdit,
}: {
  quests: TrackerQuest[];
  tracker: Tracker;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>This week&apos;s discipline</SectionLabel>
      {quests.length === 0 ? (
        <EmptyState icon={<CalendarRange className="h-6 w-6" />} message="No weekly habits set yet." />
      ) : (
        quests.map((q) => <CountCard key={q.instanceId} quest={q} tracker={tracker} cadence="weekly" />)
      )}
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400 transition-colors hover:border-white/30 hover:text-slate-200"
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
        Edit tasks
      </button>
    </div>
  );
}

/* -------- Stats tab -------- */

function StatsTab({ snapshot }: { snapshot: TrackerSnapshot }) {
  const { profile, weeklyCompleted, weeklyTotal } = snapshot;
  const stats: Stat[] = ["INT", "STR", "DIS"];

  return (
    <div className="space-y-4">
      {/* Level + title */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Level</div>
            <div className="text-3xl font-bold text-white tabular-nums">Lv {profile.level}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Title</div>
            <div className="text-sm font-semibold text-slate-200">{profile.title}</div>
          </div>
        </div>
      </div>

      {/* Stat rows */}
      <div className="space-y-3">
        <SectionLabel>Stat XP</SectionLabel>
        {stats.map((s) => {
          const accent = STAT_ACCENT[s];
          const value = profile.stats[s];
          return (
            <div key={s} className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", accent.dot)} aria-hidden />
                  <span className="text-sm font-semibold text-white">{STAT_LABEL[s]}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{s}</span>
                </div>
                <span className={cn("font-mono text-lg font-bold tabular-nums", accent.text)}>{value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly summary + streak */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">This week</div>
          <div className="mt-1 text-2xl font-bold text-white tabular-nums">
            {weeklyCompleted}
            <span className="text-base text-slate-500"> / {weeklyTotal}</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">tasks complete</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Streak</div>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-white tabular-nums">
            <Flame className="h-5 w-5 text-orange-300" />
            {profile.streakCurrent}d
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">current</div>
        </div>
      </div>
    </div>
  );
}

/* -------- Shared bits -------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">
      {children}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-slate-400">
        {icon}
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
